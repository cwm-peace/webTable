package com.peace.webtable.service;

import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.*;

import java.util.List;
import java.util.Map;

/**
 * 表单业务服务接口
 *
 * 职责：定义表单生命周期管理和三步数据读写的所有业务方法。
 * 根据范本文件，表单分为三步：
 * 第1步：基础信息（一人一条记录，30+个字段）
 * 第2步：附图（多张照片，按类别分组）
 * 第3步：接受程度自评（左侧栏 + 右侧栏，大量评估项目）
 */
public interface FormService {

    /**
     * 创建新的提交记录
     *
     * @return 包含 submissionId 和 sessionToken 的 Map
     */
    Map<String, Object> createSubmission();

    /**
     * 查询提交状态
     *
     * @param sessionToken 会话令牌
     * @return 包含 submissionId、currentStep、completed 的状态信息
     */
    Map<String, Object> getStatus(String sessionToken);

    /**
     * 标记提交为已完成
     *
     * @param sessionToken 会话令牌
     * @return 操作结果
     */
    ApiResponse<Void> completeSubmission(String sessionToken);

    // ==================== 第1步：基础信息 ====================

    /**
     * 读取基础信息
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @return 基础信息对象（一人一条）
     */
    PersonalInfo getStep1(String sessionToken, Long submissionId);

    /**
     * 保存基础信息
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @param info         基础信息数据
     * @return 操作结果
     */
    ApiResponse<Void> saveStep1(String sessionToken, Long submissionId, PersonalInfo info);

    // ==================== 第3步：接受程度自评 ====================

    /**
     * 读取左侧栏自评数据
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @return 左侧栏自评列表
     */
    List<AssessmentLeft> getStep3Left(String sessionToken, Long submissionId);

    /**
     * 保存左侧栏自评数据
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @param rows         左侧栏行数据
     * @return 操作结果
     */
    ApiResponse<Void> saveStep3Left(String sessionToken, Long submissionId, List<AssessmentLeft> rows);

    /**
     * 读取右侧栏自评数据
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @return 右侧栏自评列表
     */
    List<AssessmentRight> getStep3Right(String sessionToken, Long submissionId);

    /**
     * 保存右侧栏自评数据
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @param rows         右侧栏行数据
     * @return 操作结果
     */
    ApiResponse<Void> saveStep3Right(String sessionToken, Long submissionId, List<AssessmentRight> rows);

    // ==================== 模板数据 ====================

    /**
     * 校验会话令牌是否拥有指定 submission 的访问权。
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @return 是否拥有访问权
     */
    boolean validateSession(String sessionToken, Long submissionId);

    /**
     * 获取左侧栏评估项目模板
     *
     * @return 左侧栏模板列表（预设的评估项目，不关联 submission_id）
     */
    List<AssessmentLeftTemplate> getLeftTemplate();

    /**
     * 获取右侧栏评估项目模板
     *
     * @return 右侧栏模板列表
     */
    List<AssessmentRightTemplate> getRightTemplate();
}
