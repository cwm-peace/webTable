package com.peace.webtable.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.*;
import com.peace.webtable.mapper.*;
import com.peace.webtable.service.FormService;
import com.peace.webtable.util.ClientKeyUtil;
import com.peace.webtable.util.RedisUtil;
import com.peace.webtable.util.SessionUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 表单业务服务实现类
 *
 * 职责：实现表单生命周期管理和三步数据的读写操作。
 * 使用 Redis 做缓存（写穿透模式），MySQL 做持久化存储。
 * 步骤数据采用全量替换策略，在事务内先删后增，保证数据一致性。
 */
@Slf4j
@Service
public class FormServiceImpl implements FormService {

    /** Redis 会话 key 前缀 */
    private static final String SESSION_KEY_PREFIX = "wt:session:";
    /** Redis 步骤数据 key 前缀 */
    private static final String STEP_KEY_PREFIX = "wt:step:";
    /** Redis 模板数据 key 前缀 */
    private static final String TEMPLATE_KEY_PREFIX = "wt:template:";
    /** Redis 公开创建提交限流 key 前缀。 */
    private static final String CREATE_RATE_LIMIT_PREFIX = "wt:form:create:rate:";
    /** 会话过期时间：2 小时 */
    private static final long SESSION_TTL_HOURS = 2;
    /** 模板缓存过期时间：24 小时（模板数据不变） */
    private static final long TEMPLATE_TTL_HOURS = 24;
    /** 左侧自评模板固定 65 行，服务端限制请求规模避免恶意写放大。 */
    private static final int MAX_LEFT_ASSESSMENT_ROWS = 65;
    /** 右侧自评模板固定 60 行，服务端限制请求规模避免恶意写放大。 */
    private static final int MAX_RIGHT_ASSESSMENT_ROWS = 60;
    /** TEXT 类长文本的业务上限，避免单条草稿拖垮 Redis、导出和页面渲染。 */
    private static final int MAX_LONG_TEXT_LENGTH = 2000;
    /** 自评级别允许为空或 A-E。 */
    private static final Set<String> ALLOWED_ASSESSMENT_LEVELS = Set.of("A", "B", "C", "D", "E");

    private final SubmissionMapper submissionMapper;
    private final PersonalInfoMapper personalInfoMapper;
    private final AssessmentLeftMapper assessmentLeftMapper;
    private final AssessmentRightMapper assessmentRightMapper;
    private final AssessmentLeftTemplateMapper assessmentLeftTemplateMapper;
    private final AssessmentRightTemplateMapper assessmentRightTemplateMapper;
    private final RedisUtil redisUtil;
    private final Gson gson = new Gson();

    /** 是否启用公开创建提交限流。 */
    @Value("${app.submission.create-rate-limit.enabled:true}")
    private boolean createRateLimitEnabled = true;

    /** 单客户端在统计窗口内允许创建的 submission 数量。 */
    @Value("${app.submission.create-rate-limit.max-requests:20}")
    private int createRateLimitMaxRequests = 20;

    /** 创建提交限流统计窗口，单位分钟。 */
    @Value("${app.submission.create-rate-limit.window-minutes:10}")
    private long createRateLimitWindowMinutes = 10;

    public FormServiceImpl(SubmissionMapper submissionMapper,
                           PersonalInfoMapper personalInfoMapper,
                           AssessmentLeftMapper assessmentLeftMapper,
                           AssessmentRightMapper assessmentRightMapper,
                           AssessmentLeftTemplateMapper assessmentLeftTemplateMapper,
                           AssessmentRightTemplateMapper assessmentRightTemplateMapper,
                           RedisUtil redisUtil) {
        this.submissionMapper = submissionMapper;
        this.personalInfoMapper = personalInfoMapper;
        this.assessmentLeftMapper = assessmentLeftMapper;
        this.assessmentRightMapper = assessmentRightMapper;
        this.assessmentLeftTemplateMapper = assessmentLeftTemplateMapper;
        this.assessmentRightTemplateMapper = assessmentRightTemplateMapper;
        this.redisUtil = redisUtil;
    }

    /**
     * 创建新的提交记录
     */
    @Override
    public ApiResponse<Map<String, Object>> createSubmission(String clientIdentifier) {
        ApiResponse<Map<String, Object>> rateLimitError = validateCreateRateLimit(clientIdentifier);
        if (rateLimitError != null) {
            return rateLimitError;
        }

        String sessionToken = SessionUtil.generateToken();

        Submission submission = new Submission();
        submission.setSessionToken(sessionToken);
        submission.setCurrentStep(1);
        submission.setCompleted(false);
        submission.setCreateTime(LocalDateTime.now());
        submission.setUpdateTime(LocalDateTime.now());
        submissionMapper.insert(submission);

        // 缓存会话映射到 Redis，避免每次请求都查数据库
        cacheSessionMapping(sessionToken, submission.getId());

        log.info("创建新提交记录：submissionId={}, sessionToken={}***", submission.getId(), maskToken(sessionToken));

        Map<String, Object> result = new HashMap<>();
        result.put("submissionId", submission.getId());
        result.put("sessionToken", sessionToken);
        return ApiResponse.ok(result);
    }

    /**
     * 查询提交状态
     */
    @Override
    public Map<String, Object> getStatus(String sessionToken) {
        Submission submission = findSubmissionBySessionToken(sessionToken);
        if (submission == null) {
            log.warn("查询状态失败：sessionToken={}*** 对应的提交记录不存在", maskToken(sessionToken));
            return null;
        }

        Map<String, Object> result = new HashMap<>();
        result.put("submissionId", submission.getId());
        result.put("currentStep", submission.getCurrentStep());
        result.put("completed", submission.getCompleted());
        return result;
    }

    /**
     * 标记提交为已完成
     */
    @Override
    public ApiResponse<Void> completeSubmission(String sessionToken) {
        Submission submission = findDraftSubmissionBySessionToken(sessionToken);
        if (submission == null) {
            return ApiResponse.error(403, "会话已完成或已过期，请重新填写");
        }

        submission.setCompleted(true);
        submission.setUpdateTime(LocalDateTime.now());
        submissionMapper.updateById(submission);
        clearDraftCache(submission.getId(), sessionToken);

        log.info("提交已完成：submissionId={}", submission.getId());
        return ApiResponse.ok();
    }

    // ==================== 第1步：基础信息 ====================

    /**
     * 读取基础信息：优先从 Redis 缓存获取
     */
    @Override
    public PersonalInfo getStep1(String sessionToken, Long submissionId) {
        if (!ownsSubmission(sessionToken, submissionId)) {
            return null;
        }

        String stepKey = STEP_KEY_PREFIX + submissionId + ":1";

        Object cached = redisUtil.get(stepKey);
        if (cached instanceof PersonalInfo info) {
            return info;
        }

        PersonalInfo info = personalInfoMapper.selectOne(
                new QueryWrapper<PersonalInfo>().eq("submission_id", submissionId));

        if (info != null) {
            redisUtil.set(stepKey, info, SESSION_TTL_HOURS, TimeUnit.HOURS);
        }

        return info;
    }

    /**
     * 保存基础信息（一人一条记录）
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public ApiResponse<Void> saveStep1(String sessionToken, Long submissionId, PersonalInfo info) {
        if (!ownsSubmission(sessionToken, submissionId)) {
            return ApiResponse.error(403, "当前草稿无权访问或已失效");
        }

        ApiResponse<Void> validationError = validatePersonalInfo(info);
        if (validationError != null) {
            return validationError;
        }

        PersonalInfo existing = personalInfoMapper.selectOne(
                new QueryWrapper<PersonalInfo>().eq("submission_id", submissionId));

        if (existing != null) {
            info.setId(existing.getId());
            info.setSubmissionId(submissionId);
            personalInfoMapper.updateById(info);
        } else {
            info.setSubmissionId(submissionId);
            personalInfoMapper.insert(info);
        }

        String stepKey = STEP_KEY_PREFIX + submissionId + ":1";
        redisUtil.set(stepKey, info, SESSION_TTL_HOURS, TimeUnit.HOURS);

        updateCurrentStep(submissionId, 2);

        log.info("保存第1步数据：submissionId={}", submissionId);
        return ApiResponse.ok();
    }

    // ==================== 第3步：接受程度自评 ====================

    /**
     * 读取左侧栏自评数据
     */
    @Override
    public List<AssessmentLeft> getStep3Left(String sessionToken, Long submissionId) {
        if (!ownsSubmission(sessionToken, submissionId)) {
            return null;
        }

        String stepKey = STEP_KEY_PREFIX + submissionId + ":3:left";
        Object cached = redisUtil.get(stepKey);
        if (cached != null) {
            String json = gson.toJson(cached);
            return gson.fromJson(json,
                    TypeToken.getParameterized(List.class, AssessmentLeft.class).getType());
        }

        List<AssessmentLeft> list = assessmentLeftMapper.selectList(
                new QueryWrapper<AssessmentLeft>()
                        .eq("submission_id", submissionId)
                        .orderByAsc("row_order"));

        redisUtil.set(stepKey, list, SESSION_TTL_HOURS, TimeUnit.HOURS);
        return list;
    }

    /**
     * 保存左侧栏自评数据（全量替换）
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public ApiResponse<Void> saveStep3Left(String sessionToken, Long submissionId, List<AssessmentLeft> rows) {
        if (!ownsSubmission(sessionToken, submissionId)) {
            return ApiResponse.error(403, "当前草稿无权访问或已失效");
        }

        ApiResponse<Void> validationError = validateLeftAssessmentRows(rows);
        if (validationError != null) {
            return validationError;
        }

        assessmentLeftMapper.deleteBySubmissionId(submissionId);

        if (rows != null && !rows.isEmpty()) {
            for (int i = 0; i < rows.size(); i++) {
                AssessmentLeft row = rows.get(i);
                row.setSubmissionId(submissionId);
                if (row.getRowOrder() == null) {
                    row.setRowOrder(i);
                }
                assessmentLeftMapper.insert(row);
            }
        }

        String stepKey = STEP_KEY_PREFIX + submissionId + ":3:left";
        redisUtil.set(stepKey, rows, SESSION_TTL_HOURS, TimeUnit.HOURS);

        updateCurrentStep(submissionId, 3);

        log.info("保存第3步左侧数据：submissionId={}, 行数={}", submissionId, rows != null ? rows.size() : 0);
        return ApiResponse.ok();
    }

    /**
     * 读取右侧栏自评数据
     */
    @Override
    public List<AssessmentRight> getStep3Right(String sessionToken, Long submissionId) {
        if (!ownsSubmission(sessionToken, submissionId)) {
            return null;
        }

        String stepKey = STEP_KEY_PREFIX + submissionId + ":3:right";
        Object cached = redisUtil.get(stepKey);
        if (cached != null) {
            String json = gson.toJson(cached);
            return gson.fromJson(json,
                    TypeToken.getParameterized(List.class, AssessmentRight.class).getType());
        }

        List<AssessmentRight> list = assessmentRightMapper.selectList(
                new QueryWrapper<AssessmentRight>()
                        .eq("submission_id", submissionId)
                        .orderByAsc("row_order"));

        redisUtil.set(stepKey, list, SESSION_TTL_HOURS, TimeUnit.HOURS);
        return list;
    }

    /**
     * 保存右侧栏自评数据（全量替换）
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public ApiResponse<Void> saveStep3Right(String sessionToken, Long submissionId, List<AssessmentRight> rows) {
        if (!ownsSubmission(sessionToken, submissionId)) {
            return ApiResponse.error(403, "当前草稿无权访问或已失效");
        }

        ApiResponse<Void> validationError = validateRightAssessmentRows(rows);
        if (validationError != null) {
            return validationError;
        }

        assessmentRightMapper.deleteBySubmissionId(submissionId);

        if (rows != null && !rows.isEmpty()) {
            for (int i = 0; i < rows.size(); i++) {
                AssessmentRight row = rows.get(i);
                row.setSubmissionId(submissionId);
                if (row.getRowOrder() == null) {
                    row.setRowOrder(i);
                }
                assessmentRightMapper.insert(row);
            }
        }

        String stepKey = STEP_KEY_PREFIX + submissionId + ":3:right";
        redisUtil.set(stepKey, rows, SESSION_TTL_HOURS, TimeUnit.HOURS);

        updateCurrentStep(submissionId, 3);

        log.info("保存第3步右侧数据：submissionId={}, 行数={}", submissionId, rows != null ? rows.size() : 0);
        return ApiResponse.ok();
    }

    // ==================== 模板数据 ====================

    /**
     * 获取左侧栏评估项目模板
     *
     * 模板数据不变，首次查询后缓存到 Redis，后续读缓存避免重复查库。
     */
    @SuppressWarnings("unchecked")
    @Override
    public List<AssessmentLeftTemplate> getLeftTemplate() {
        String key = TEMPLATE_KEY_PREFIX + "left";
        Object cached = redisUtil.get(key);
        if (cached instanceof List) {
            return (List<AssessmentLeftTemplate>) cached;
        }
        List<AssessmentLeftTemplate> list = assessmentLeftTemplateMapper.selectList(
                new QueryWrapper<AssessmentLeftTemplate>().orderByAsc("row_order"));
        redisUtil.set(key, list, TEMPLATE_TTL_HOURS, TimeUnit.HOURS);
        return list;
    }

    /**
     * 获取右侧栏评估项目模板
     */
    @SuppressWarnings("unchecked")
    @Override
    public List<AssessmentRightTemplate> getRightTemplate() {
        String key = TEMPLATE_KEY_PREFIX + "right";
        Object cached = redisUtil.get(key);
        if (cached instanceof List) {
            return (List<AssessmentRightTemplate>) cached;
        }
        List<AssessmentRightTemplate> list = assessmentRightTemplateMapper.selectList(
                new QueryWrapper<AssessmentRightTemplate>().orderByAsc("row_order"));
        redisUtil.set(key, list, TEMPLATE_TTL_HOURS, TimeUnit.HOURS);
        return list;
    }

    // ==================== 内部方法 ====================

    /**
     * 根据会话令牌定位提交记录
     *
     * 优先查 Redis，会话缓存失效时回源数据库，并自动回填缓存。
     */
    private Submission findSubmissionBySessionToken(String sessionToken) {
        String sessionKey = SESSION_KEY_PREFIX + sessionToken;
        Number submissionIdNum = (Number) redisUtil.get(sessionKey);

        Submission submission = null;
        if (submissionIdNum != null) {
            submission = submissionMapper.selectById(submissionIdNum.longValue());
        }

        if (submission == null) {
            submission = submissionMapper.selectOne(
                    new QueryWrapper<Submission>().eq("session_token", sessionToken));
            if (submission != null && !Boolean.TRUE.equals(submission.getCompleted())) {
                cacheSessionMapping(sessionToken, submission.getId());
            }
        }

        return submission;
    }

    /**
     * 根据会话令牌定位仍可填写的草稿提交。
     *
     * 已完成提交只能通过管理端查看，填写端旧 token 即使仍存在于数据库也不能继续读写。
     */
    private Submission findDraftSubmissionBySessionToken(String sessionToken) {
        Submission submission = findSubmissionBySessionToken(sessionToken);
        if (submission == null) {
            return null;
        }
        if (Boolean.TRUE.equals(submission.getCompleted())) {
            log.warn("已完成提交拒绝填写端草稿访问：submissionId={}, sessionToken={}***",
                    submission.getId(), maskToken(sessionToken));
            clearDraftCache(submission.getId(), sessionToken);
            return null;
        }
        return submission;
    }

    /**
     * 校验当前 submission 是否归属于当前会话。
     */
    private boolean ownsSubmission(String sessionToken, Long submissionId) {
        Submission submission = findDraftSubmissionBySessionToken(sessionToken);
        boolean owned = submission != null && submission.getId() != null && submission.getId().equals(submissionId);
        if (!owned) {
            log.warn("草稿归属校验失败：sessionToken={}***, submissionId={}", maskToken(sessionToken), submissionId);
        }
        return owned;
    }

    /**
     * 缓存会话与 submission 的映射。
     */
    private void cacheSessionMapping(String sessionToken, Long submissionId) {
        redisUtil.set(SESSION_KEY_PREFIX + sessionToken, submissionId, SESSION_TTL_HOURS, TimeUnit.HOURS);
    }

    /**
     * 校验公开创建提交的客户端限流。
     *
     * 创建提交会写数据库和 Redis，需要在公开入口前置轻量限流，避免脚本刷出大量空 submission。
     */
    private ApiResponse<Map<String, Object>> validateCreateRateLimit(String clientIdentifier) {
        if (!createRateLimitEnabled) {
            return null;
        }
        if (createRateLimitMaxRequests < 1 || createRateLimitWindowMinutes < 1) {
            throw new IllegalStateException("创建提交限流配置必须为正数");
        }

        String clientKey = ClientKeyUtil.hashClientIdentifier(clientIdentifier);
        String key = CREATE_RATE_LIMIT_PREFIX + clientKey;
        Long requestCount = redisUtil.increment(key);
        long count = requestCount != null ? requestCount : 1L;
        if (count == 1L) {
            redisUtil.expire(key, createRateLimitWindowMinutes, TimeUnit.MINUTES);
        }
        if (count > createRateLimitMaxRequests) {
            log.warn("创建提交请求被限流：clientKey={}, count={}, max={}", clientKey, count, createRateLimitMaxRequests);
            return ApiResponse.error(429, "创建草稿过于频繁，请稍后再试");
        }
        return null;
    }

    /**
     * 清理 Redis 中的草稿缓存。
     */
    private void clearDraftCache(Long submissionId, String sessionToken) {
        redisUtil.delete(SESSION_KEY_PREFIX + sessionToken);
        redisUtil.delete(STEP_KEY_PREFIX + submissionId + ":1");
        redisUtil.delete(STEP_KEY_PREFIX + submissionId + ":3:left");
        redisUtil.delete(STEP_KEY_PREFIX + submissionId + ":3:right");
    }

    /**
     * 更新提交记录的当前步骤
     *
     * 使用单条 UPDATE 语句，WHERE 条件 current_step < step 避免回退步骤。
     * 比 SELECT + UPDATEById 两次查询更高效。
     */
    private void updateCurrentStep(Long submissionId, int step) {
        submissionMapper.update(null,
                new com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper<Submission>()
                        .eq("id", submissionId)
                        .lt("current_step", step)
                        .set("current_step", step)
                        .set("update_time", LocalDateTime.now()));
    }

    /**
     * 校验基础信息字段长度，避免绕过前端提交超长字符串放大数据库、Redis 和导出成本。
     */
    private ApiResponse<Void> validatePersonalInfo(PersonalInfo info) {
        if (info == null) {
            return ApiResponse.error(400, "基础信息不能为空");
        }

        List<TextField> fields = List.of(
                new TextField("名字", info.getName(), 100),
                new TextField("身高", info.getHeight(), 20),
                new TextField("体重", info.getWeight(), 20),
                new TextField("学历", info.getEducation(), 50),
                new TextField("职业", info.getOccupation(), 100),
                new TextField("鞋码", info.getShoeSize(), 20),
                new TextField("省份", info.getProvince(), 50),
                new TextField("城市", info.getCity(), 50),
                new TextField("QQ号", info.getQq(), 30),
                new TextField("微信号", info.getWechat(), 50),
                new TextField("微博名", info.getWeibo(), 50),
                new TextField("电话号码", info.getPhone(), 20),
                new TextField("第一次自慰年龄", info.getFirstMasturbationAge(), 20),
                new TextField("破处年龄", info.getFirstSexAge(), 20),
                new TextField("是否单身", info.getIsSingle(), 10),
                new TextField("是否绿过伴侣", info.getCheatedOnPartner(), 10),
                new TextField("是否被伴侣绿过", info.getBeenCheated(), 10),
                new TextField("最长带锁时间", info.getLongestLockTime(), 50),
                new TextField("做爱频率", info.getSexFrequency(), 50),
                new TextField("自慰频率", info.getMasturbationFrequency(), 50),
                new TextField("自慰工具", info.getMasturbationTool(), 100),
                new TextField("菊穴可完全插入尺寸", info.getAnalInsertableSize(), 50),
                new TextField("尿道可完全插入尺寸", info.getUrethraInsertableSize(), 50),
                new TextField("犬龄", info.getDogAge(), 50),
                new TextField("约调次数", info.getMeetingCount(), 20),
                new TextField("侍主人数", info.getMasterCount(), 20),
                new TextField("精液量", info.getSemenVolume(), 20),
                new TextField("每日最高射精次数", info.getDailyMaxEjaculation(), 20),
                new TextField("喜欢被叫的称呼", info.getPreferredName(), 100),
                new TextField("一句话形容自己", info.getSelfDescription(), 500),
                new TextField("备注", info.getRemark(), MAX_LONG_TEXT_LENGTH),
                new TextField("培养意向", info.getTrainingIntention(), MAX_LONG_TEXT_LENGTH)
        );

        for (TextField field : fields) {
            ApiResponse<Void> error = validateTextLength(field.fieldName(), field.value(), field.maxLength());
            if (error != null) {
                return error;
            }
        }
        return null;
    }

    /**
     * 校验自评行数，避免绕过前端提交超大数组造成数据库和 Redis 写放大。
     */
    private ApiResponse<Void> validateAssessmentRowCount(List<?> rows, int maxRows, String sideName) {
        if (rows != null && rows.size() > maxRows) {
            log.warn("第3步{}自评行数超过限制：maxRows={}, actualRows={}", sideName, maxRows, rows.size());
            return ApiResponse.error(400, sideName + "自评最多允许 " + maxRows + " 行");
        }
        return null;
    }

    /**
     * 校验左侧自评字段长度、级别和排序号。
     */
    private ApiResponse<Void> validateLeftAssessmentRows(List<AssessmentLeft> rows) {
        ApiResponse<Void> rowLimitError = validateAssessmentRowCount(rows, MAX_LEFT_ASSESSMENT_ROWS, "左侧");
        if (rowLimitError != null || rows == null) {
            return rowLimitError;
        }
        for (int i = 0; i < rows.size(); i++) {
            AssessmentLeft row = rows.get(i);
            if (row == null) {
                return ApiResponse.error(400, "左侧第" + (i + 1) + "行不能为空");
            }
            ApiResponse<Void> error = validateAssessmentRow(
                    row.getTypeName(),
                    row.getItemName(),
                    row.getLevel(),
                    row.getRemark(),
                    row.getRowOrder(),
                    MAX_LEFT_ASSESSMENT_ROWS,
                    "左侧",
                    i + 1);
            if (error != null) {
                return error;
            }
        }
        return null;
    }

    /**
     * 校验右侧自评字段长度、级别和排序号。
     */
    private ApiResponse<Void> validateRightAssessmentRows(List<AssessmentRight> rows) {
        ApiResponse<Void> rowLimitError = validateAssessmentRowCount(rows, MAX_RIGHT_ASSESSMENT_ROWS, "右侧");
        if (rowLimitError != null || rows == null) {
            return rowLimitError;
        }
        for (int i = 0; i < rows.size(); i++) {
            AssessmentRight row = rows.get(i);
            if (row == null) {
                return ApiResponse.error(400, "右侧第" + (i + 1) + "行不能为空");
            }
            ApiResponse<Void> error = validateAssessmentRow(
                    row.getTypeName(),
                    row.getItemName(),
                    row.getLevel(),
                    row.getRemark(),
                    row.getRowOrder(),
                    MAX_RIGHT_ASSESSMENT_ROWS,
                    "右侧",
                    i + 1);
            if (error != null) {
                return error;
            }
        }
        return null;
    }

    /**
     * 校验单行自评字段。
     */
    private ApiResponse<Void> validateAssessmentRow(String typeName,
                                                    String itemName,
                                                    String level,
                                                    String remark,
                                                    Integer rowOrder,
                                                    int maxRows,
                                                    String sideName,
                                                    int displayRow) {
        ApiResponse<Void> typeError = validateTextLength(sideName + "第" + displayRow + "行类型", typeName, 50);
        if (typeError != null) return typeError;
        ApiResponse<Void> itemError = validateTextLength(sideName + "第" + displayRow + "行项目", itemName, 100);
        if (itemError != null) return itemError;
        ApiResponse<Void> levelLengthError = validateTextLength(sideName + "第" + displayRow + "行级别", level, 10);
        if (levelLengthError != null) return levelLengthError;
        ApiResponse<Void> remarkError = validateTextLength(sideName + "第" + displayRow + "行备注", remark, 500);
        if (remarkError != null) return remarkError;

        if (level != null && !level.isBlank() && !ALLOWED_ASSESSMENT_LEVELS.contains(level)) {
            return ApiResponse.error(400, sideName + "第" + displayRow + "行级别只能是 A-E");
        }
        if (rowOrder != null && (rowOrder < 0 || rowOrder > maxRows)) {
            return ApiResponse.error(400, sideName + "第" + displayRow + "行排序号不正确");
        }
        return null;
    }

    /**
     * 校验单个文本字段长度。
     */
    private ApiResponse<Void> validateTextLength(String fieldName, String value, int maxLength) {
        if (value != null && value.length() > maxLength) {
            return ApiResponse.error(400, fieldName + "长度不能超过 " + maxLength + " 个字符");
        }
        return null;
    }

    /**
     * 校验会话令牌是否拥有指定 submission 的访问权。
     *
     * 供外部控制器（如 PhotoController）调用，复用内部归属校验逻辑。
     */
    @Override
    public boolean validateSession(String sessionToken, Long submissionId) {
        return ownsSubmission(sessionToken, submissionId);
    }

    /**
     * 脱敏显示会话令牌。
     */
    private String maskToken(String sessionToken) {
        return sessionToken.substring(0, Math.min(4, sessionToken.length()));
    }

    /** 文本字段长度约束。 */
    private record TextField(String fieldName, String value, int maxLength) {
    }
}
