package com.peace.webtable.controller;

import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.*;
import com.peace.webtable.service.FormService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 表单控制器
 *
 * 职责：处理个人信息收集表单的所有 HTTP 请求。
 * 包括提交生命周期管理（创建、查询、完成）和三步数据的读写操作。
 * 所有接口以 /api/form 为路径前缀，通过 X-Session-Token 请求头标识用户会话。
 *
 * 表单流程（对应范本文件三个 Sheet）：
 * 1. 基础信息（一人一条，30+字段）
 * 2. 附图（由 PhotoController 单独处理）
 * 3. 接受程度自评（左侧栏 + 右侧栏）
 */
@Slf4j
@RestController
@RequestMapping("/api/form")
public class FormController {

    private final FormService formService;

    public FormController(FormService formService) {
        this.formService = formService;
    }

    // ==================== 提交生命周期 ====================

    /**
     * 创建新的提交记录
     *
     * @return 包含 submissionId 和 sessionToken 的响应
     */
    @PostMapping
    public ApiResponse<Map<String, Object>> createSubmission() {
        log.info("收到创建提交请求");
        Map<String, Object> result = formService.createSubmission();
        return ApiResponse.ok(result);
    }

    /**
     * 查询提交状态
     *
     * @param sessionToken 会话令牌（从请求头获取）
     * @return 包含 currentStep 和 completed 的状态信息
     */
    @GetMapping("/status")
    public ApiResponse<Map<String, Object>> getStatus(@RequestHeader("X-Session-Token") String sessionToken) {
        log.info("查询提交状态：sessionToken={}***", sessionToken.substring(0, Math.min(4, sessionToken.length())));
        Map<String, Object> status = formService.getStatus(sessionToken);
        if (status == null) {
            return ApiResponse.error(404, "会话不存在或已过期");
        }
        return ApiResponse.ok(status);
    }

    /**
     * 标记提交为已完成
     *
     * @param sessionToken 会话令牌
     * @return 操作结果
     */
    @PutMapping("/complete")
    public ApiResponse<Void> completeSubmission(@RequestHeader("X-Session-Token") String sessionToken) {
        log.info("收到完成提交请求：sessionToken={}***", sessionToken.substring(0, Math.min(4, sessionToken.length())));
        return formService.completeSubmission(sessionToken);
    }

    // ==================== 第1步：基础信息 ====================

    /**
     * 读取基础信息数据
     *
     * 返回当前提交的基础信息记录（一人一条）。
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @return 基础信息对象
     */
    @GetMapping("/step1/{submissionId}")
    public ApiResponse<PersonalInfo> getStep1(@RequestHeader("X-Session-Token") String sessionToken,
                                              @PathVariable Long submissionId) {
        log.info("读取第1步数据：submissionId={}", submissionId);
        PersonalInfo data = formService.getStep1(sessionToken, submissionId);
        if (data == null) {
            return ApiResponse.error(403, "当前草稿无权访问或已失效");
        }
        return ApiResponse.ok(data);
    }

    /**
     * 保存基础信息数据
     *
     * 如果已有记录则更新，否则新建。一人一条记录。
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @param info         基础信息数据
     * @return 操作结果
     */
    @PutMapping("/step1/{submissionId}")
    public ApiResponse<Void> saveStep1(@RequestHeader("X-Session-Token") String sessionToken,
                                       @PathVariable Long submissionId,
                                       @RequestBody PersonalInfo info) {
        log.info("保存第1步数据：submissionId={}", submissionId);
        return formService.saveStep1(sessionToken, submissionId, info);
    }

    // ==================== 第3步：接受程度自评 ====================

    /**
     * 读取左侧栏自评数据
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @return 左侧栏自评列表
     */
    @GetMapping("/step3/left/{submissionId}")
    public ApiResponse<List<AssessmentLeft>> getStep3Left(@RequestHeader("X-Session-Token") String sessionToken,
                                                          @PathVariable Long submissionId) {
        log.info("读取第3步左侧数据：submissionId={}", submissionId);
        List<AssessmentLeft> data = formService.getStep3Left(sessionToken, submissionId);
        if (data == null) {
            return ApiResponse.error(403, "当前草稿无权访问或已失效");
        }
        return ApiResponse.ok(data);
    }

    /**
     * 保存左侧栏自评数据
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @param rows         左侧栏行数据
     * @return 操作结果
     */
    @PutMapping("/step3/left/{submissionId}")
    public ApiResponse<Void> saveStep3Left(@RequestHeader("X-Session-Token") String sessionToken,
                                           @PathVariable Long submissionId,
                                           @RequestBody List<AssessmentLeft> rows) {
        log.info("保存第3步左侧数据：submissionId={}, 行数={}", submissionId,
                rows != null ? rows.size() : 0);
        return formService.saveStep3Left(sessionToken, submissionId, rows);
    }

    /**
     * 读取右侧栏自评数据
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @return 右侧栏自评列表
     */
    @GetMapping("/step3/right/{submissionId}")
    public ApiResponse<List<AssessmentRight>> getStep3Right(@RequestHeader("X-Session-Token") String sessionToken,
                                                            @PathVariable Long submissionId) {
        log.info("读取第3步右侧数据：submissionId={}", submissionId);
        List<AssessmentRight> data = formService.getStep3Right(sessionToken, submissionId);
        if (data == null) {
            return ApiResponse.error(403, "当前草稿无权访问或已失效");
        }
        return ApiResponse.ok(data);
    }

    /**
     * 保存右侧栏自评数据
     *
     * @param sessionToken 会话令牌
     * @param submissionId 提交记录ID
     * @param rows         右侧栏行数据
     * @return 操作结果
     */
    @PutMapping("/step3/right/{submissionId}")
    public ApiResponse<Void> saveStep3Right(@RequestHeader("X-Session-Token") String sessionToken,
                                            @PathVariable Long submissionId,
                                            @RequestBody List<AssessmentRight> rows) {
        log.info("保存第3步右侧数据：submissionId={}, 行数={}", submissionId,
                rows != null ? rows.size() : 0);
        return formService.saveStep3Right(sessionToken, submissionId, rows);
    }

    // ==================== 模板数据 ====================

    /**
     * 获取左侧栏评估项目模板
     *
     * 返回预设的左侧栏评估项目列表（类型+项目名称），
     * 前端新用户首次加载第3步时使用模板初始化表格。
     *
     * @return 左侧栏模板列表
     */
    @GetMapping("/template/left")
    public ApiResponse<List<AssessmentLeftTemplate>> getLeftTemplate() {
        log.info("获取左侧栏模板数据");
        List<AssessmentLeftTemplate> data = formService.getLeftTemplate();
        return ApiResponse.ok(data);
    }

    /**
     * 获取右侧栏评估项目模板
     *
     * @return 右侧栏模板列表
     */
    @GetMapping("/template/right")
    public ApiResponse<List<AssessmentRightTemplate>> getRightTemplate() {
        log.info("获取右侧栏模板数据");
        List<AssessmentRightTemplate> data = formService.getRightTemplate();
        return ApiResponse.ok(data);
    }
}
