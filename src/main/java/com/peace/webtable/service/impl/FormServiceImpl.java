package com.peace.webtable.service.impl;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.*;
import com.peace.webtable.mapper.*;
import com.peace.webtable.service.FormService;
import com.peace.webtable.util.RedisUtil;
import com.peace.webtable.util.SessionUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
    /** 会话过期时间：2 小时 */
    private static final long SESSION_TTL_HOURS = 2;

    private final SubmissionMapper submissionMapper;
    private final PersonalInfoMapper personalInfoMapper;
    private final AssessmentLeftMapper assessmentLeftMapper;
    private final AssessmentRightMapper assessmentRightMapper;
    private final AssessmentLeftTemplateMapper assessmentLeftTemplateMapper;
    private final AssessmentRightTemplateMapper assessmentRightTemplateMapper;
    private final RedisUtil redisUtil;

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
    public Map<String, Object> createSubmission() {
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
        return result;
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
        Submission submission = findSubmissionBySessionToken(sessionToken);
        if (submission == null) {
            return ApiResponse.error("会话已过期，请重新填写");
        }

        submission.setCompleted(true);
        submission.setUpdateTime(LocalDateTime.now());
        submissionMapper.updateById(submission);
        log.info("提交状态已更新到数据库：submissionId={}, completed=true", submission.getId());

        clearDraftCache(submission.getId(), sessionToken);
        log.info("已清理 Redis 草稿缓存：submissionId={}", submission.getId());

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
        if (cached != null) {
            try {
                log.info("第1步缓存命中：submissionId={}", submissionId);
                return toJavaObject(cached, PersonalInfo.class);
            } catch (Exception e) {
                log.warn("第1步缓存数据转换失败，回源数据库：submissionId={}, error={}", submissionId, e.getMessage());
                redisUtil.delete(stepKey);
            }
        }

        log.info("第1步缓存未命中，回源数据库：submissionId={}", submissionId);
        PersonalInfo info = personalInfoMapper.selectOne(
                new QueryWrapper<PersonalInfo>().eq("submission_id", submissionId));

        if (info != null) {
            redisUtil.set(stepKey, info, SESSION_TTL_HOURS, TimeUnit.HOURS);
            log.info("第1步数据已缓存到 Redis：submissionId={}", submissionId);
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

        PersonalInfo existing = personalInfoMapper.selectOne(
                new QueryWrapper<PersonalInfo>().eq("submission_id", submissionId));

        if (existing != null) {
            info.setId(existing.getId());
            info.setSubmissionId(submissionId);
            personalInfoMapper.updateById(info);
            log.info("第1步数据已更新到数据库：submissionId={}, id={}", submissionId, existing.getId());
        } else {
            info.setSubmissionId(submissionId);
            personalInfoMapper.insert(info);
            log.info("第1步数据已写入数据库：submissionId={}, 新记录 id={}", submissionId, info.getId());
        }

        String stepKey = STEP_KEY_PREFIX + submissionId + ":1";
        redisUtil.set(stepKey, info, SESSION_TTL_HOURS, TimeUnit.HOURS);
        log.info("第1步数据已同步到 Redis 缓存：key={}, submissionId={}", stepKey, submissionId);

        updateCurrentStep(submissionId, 2);

        log.info("保存第1步数据完成：submissionId={}", submissionId);
        return ApiResponse.ok();
    }

    // ==================== 第3步：接受程度自评 ====================

    /**
     * 读取左侧栏自评数据（直接查数据库）
     */
    @Override
    public List<AssessmentLeft> getStep3Left(String sessionToken, Long submissionId) {
        if (!ownsSubmission(sessionToken, submissionId)) {
            return null;
        }

        List<AssessmentLeft> list = assessmentLeftMapper.selectList(
                new QueryWrapper<AssessmentLeft>()
                        .eq("submission_id", submissionId)
                        .orderByAsc("row_order"));
        log.info("读取第3步左侧数据：submissionId={}, 行数={}", submissionId, list.size());
        return list;
    }

    /**
     * 保存左侧栏自评数据（全量替换，直接写数据库）
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public ApiResponse<Void> saveStep3Left(String sessionToken, Long submissionId, List<AssessmentLeft> rows) {
        if (!ownsSubmission(sessionToken, submissionId)) {
            return ApiResponse.error(403, "当前草稿无权访问或已失效");
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
            log.info("保存第3步左侧数据到数据库：submissionId={}, 行数={}", submissionId, rows.size());
        } else {
            log.info("第3步左侧数据为空，仅清除旧数据：submissionId={}", submissionId);
        }

        updateCurrentStep(submissionId, 3);
        return ApiResponse.ok();
    }

    /**
     * 读取右侧栏自评数据（直接查数据库）
     */
    @Override
    public List<AssessmentRight> getStep3Right(String sessionToken, Long submissionId) {
        if (!ownsSubmission(sessionToken, submissionId)) {
            return null;
        }

        List<AssessmentRight> list = assessmentRightMapper.selectList(
                new QueryWrapper<AssessmentRight>()
                        .eq("submission_id", submissionId)
                        .orderByAsc("row_order"));
        log.info("读取第3步右侧数据：submissionId={}, 行数={}", submissionId, list.size());
        return list;
    }

    /**
     * 保存右侧栏自评数据（全量替换，直接写数据库）
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public ApiResponse<Void> saveStep3Right(String sessionToken, Long submissionId, List<AssessmentRight> rows) {
        if (!ownsSubmission(sessionToken, submissionId)) {
            return ApiResponse.error(403, "当前草稿无权访问或已失效");
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
            log.info("保存第3步右侧数据到数据库：submissionId={}, 行数={}", submissionId, rows.size());
        } else {
            log.info("第3步右侧数据为空，仅清除旧数据：submissionId={}", submissionId);
        }

        updateCurrentStep(submissionId, 3);
        return ApiResponse.ok();
    }

    // ==================== 模板数据 ====================

    /**
     * 获取左侧栏评估项目模板（直接查数据库）
     */
    @Override
    public List<AssessmentLeftTemplate> getLeftTemplate() {
        List<AssessmentLeftTemplate> list = assessmentLeftTemplateMapper.selectList(
                new QueryWrapper<AssessmentLeftTemplate>().orderByAsc("row_order"));
        log.info("获取左侧栏模板：行数={}", list.size());
        return list;
    }

    /**
     * 获取右侧栏评估项目模板（直接查数据库）
     */
    @Override
    public List<AssessmentRightTemplate> getRightTemplate() {
        List<AssessmentRightTemplate> list = assessmentRightTemplateMapper.selectList(
                new QueryWrapper<AssessmentRightTemplate>().orderByAsc("row_order"));
        log.info("获取右侧栏模板：行数={}", list.size());
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
     * 校验当前 submission 是否归属于当前会话。
     */
    private boolean ownsSubmission(String sessionToken, Long submissionId) {
        Submission submission = findSubmissionBySessionToken(sessionToken);
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
     * 清理 Redis 中的草稿缓存。
     */
    private void clearDraftCache(Long submissionId, String sessionToken) {
        redisUtil.delete(SESSION_KEY_PREFIX + sessionToken);
        redisUtil.delete(STEP_KEY_PREFIX + submissionId + ":1");
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

    /**
     * 将 Redis 缓存对象安全转换为目标 Java 类型
     *
     * 兼容 Fastjson2 反序列化结果（JSONObject / 原始类型 / 已有类型）。
     *
     * @param cached Redis 缓存对象
     * @param clazz  目标类型
     * @return 转换后的对象
     */
    private <T> T toJavaObject(Object cached, Class<T> clazz) {
        if (clazz.isInstance(cached)) {
            return clazz.cast(cached);
        }
        return JSON.parseObject(JSON.toJSONString(cached), clazz);
    }
}
