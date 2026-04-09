package com.peace.webtable.service.impl;

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
import java.util.*;
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
        String sessionKey = SESSION_KEY_PREFIX + sessionToken;
        redisUtil.set(sessionKey, submission.getId(), SESSION_TTL_HOURS, TimeUnit.HOURS);

        log.info("创建新提交记录：submissionId={}, sessionToken={}***", submission.getId(), sessionToken.substring(0, Math.min(4, sessionToken.length())));

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
        String sessionKey = SESSION_KEY_PREFIX + sessionToken;
        Number submissionIdNum = (Number) redisUtil.get(sessionKey);
        Long submissionId = submissionIdNum != null ? submissionIdNum.longValue() : null;

        Submission submission;
        if (submissionId != null) {
            submission = submissionMapper.selectById(submissionId);
        } else {
            // 缓存过期时从数据库按 session_token 查询
            submission = submissionMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<Submission>()
                            .eq("session_token", sessionToken));
            if (submission != null) {
                redisUtil.set(sessionKey, submission.getId(), SESSION_TTL_HOURS, TimeUnit.HOURS);
            }
        }

        if (submission == null) {
            log.warn("查询状态失败：sessionToken={}*** 对应的提交记录不存在", sessionToken.substring(0, Math.min(4, sessionToken.length())));
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
        String sessionKey = SESSION_KEY_PREFIX + sessionToken;
        Number submissionIdNum = (Number) redisUtil.get(sessionKey);

        if (submissionIdNum == null) {
            return ApiResponse.error("会话已过期，请重新填写");
        }
        Long submissionId = submissionIdNum.longValue();

        Submission submission = submissionMapper.selectById(submissionId);
        if (submission == null) {
            return ApiResponse.error("提交记录不存在");
        }

        submission.setCompleted(true);
        submission.setUpdateTime(LocalDateTime.now());
        submissionMapper.updateById(submission);

        log.info("提交已完成：submissionId={}", submissionId);
        return ApiResponse.ok();
    }

    // ==================== 第1步：基础信息 ====================

    /**
     * 读取基础信息：优先从 Redis 缓存获取
     */
    @Override
    public PersonalInfo getStep1(Long submissionId) {
        String stepKey = STEP_KEY_PREFIX + submissionId + ":1";

        // 先查 Redis 缓存
        Object cached = redisUtil.get(stepKey);
        if (cached instanceof PersonalInfo) {
            return (PersonalInfo) cached;
        }

        // 缓存未命中，查数据库
        PersonalInfo info = personalInfoMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<PersonalInfo>()
                        .eq("submission_id", submissionId));

        // 回填缓存
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
    public ApiResponse<Void> saveStep1(Long submissionId, PersonalInfo info) {
        // 查看是否已有记录
        PersonalInfo existing = personalInfoMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<PersonalInfo>()
                        .eq("submission_id", submissionId));

        if (existing != null) {
            // 更新已有记录
            info.setId(existing.getId());
            info.setSubmissionId(submissionId);
            personalInfoMapper.updateById(info);
        } else {
            // 插入新记录
            info.setSubmissionId(submissionId);
            personalInfoMapper.insert(info);
        }

        // 更新 Redis 缓存
        String stepKey = STEP_KEY_PREFIX + submissionId + ":1";
        redisUtil.set(stepKey, info, SESSION_TTL_HOURS, TimeUnit.HOURS);

        // 更新步骤进度
        updateCurrentStep(submissionId, 2);

        log.info("保存第1步数据：submissionId={}", submissionId);
        return ApiResponse.ok();
    }

    // ==================== 第3步：接受程度自评 ====================

    /**
     * 读取左侧栏自评数据
     */
    @Override
    @SuppressWarnings("unchecked")
    public List<AssessmentLeft> getStep3Left(Long submissionId) {
        String stepKey = STEP_KEY_PREFIX + submissionId + ":3:left";

        Object cached = redisUtil.get(stepKey);
        if (cached != null) {
            com.google.gson.Gson gson = new com.google.gson.Gson();
            String json = gson.toJson(cached);
            return gson.fromJson(json,
                    com.google.gson.reflect.TypeToken.getParameterized(List.class, AssessmentLeft.class).getType());
        }

        List<AssessmentLeft> list = assessmentLeftMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<AssessmentLeft>()
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
    public ApiResponse<Void> saveStep3Left(Long submissionId, List<AssessmentLeft> rows) {
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
    @SuppressWarnings("unchecked")
    public List<AssessmentRight> getStep3Right(Long submissionId) {
        String stepKey = STEP_KEY_PREFIX + submissionId + ":3:right";

        Object cached = redisUtil.get(stepKey);
        if (cached != null) {
            com.google.gson.Gson gson = new com.google.gson.Gson();
            String json = gson.toJson(cached);
            return gson.fromJson(json,
                    com.google.gson.reflect.TypeToken.getParameterized(List.class, AssessmentRight.class).getType());
        }

        List<AssessmentRight> list = assessmentRightMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<AssessmentRight>()
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
    public ApiResponse<Void> saveStep3Right(Long submissionId, List<AssessmentRight> rows) {
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
     * 从预设模板表查询所有左侧栏评估项目，按排序号排列。
     */
    @Override
    public List<AssessmentLeftTemplate> getLeftTemplate() {
        return assessmentLeftTemplateMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<AssessmentLeftTemplate>()
                        .orderByAsc("row_order"));
    }

    /**
     * 获取右侧栏评估项目模板
     */
    @Override
    public List<AssessmentRightTemplate> getRightTemplate() {
        return assessmentRightTemplateMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<AssessmentRightTemplate>()
                        .orderByAsc("row_order"));
    }

    // ==================== 内部方法 ====================

    /**
     * 更新提交记录的当前步骤
     *
     * 只在目标步骤大于等于当前步骤时更新（用户前进或保存同一步骤时）。
     */
    private void updateCurrentStep(Long submissionId, int step) {
        Submission submission = submissionMapper.selectById(submissionId);
        if (submission != null && submission.getCurrentStep() < step) {
            submission.setCurrentStep(step);
            submission.setUpdateTime(LocalDateTime.now());
            submissionMapper.updateById(submission);
        }
    }
}
