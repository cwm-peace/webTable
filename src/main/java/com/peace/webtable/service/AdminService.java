package com.peace.webtable.service;

import com.peace.webtable.dto.ApiResponse;

import java.io.ByteArrayOutputStream;
import java.util.Map;

/**
 * 管理员业务服务接口
 *
 * 职责：定义管理员系统的所有业务方法。
 * 包括登录验证、提交列表查询、单个提交详情查询、PDF 导出。
 */
public interface AdminService {

    /**
     * 管理员登录验证
     *
     * 验证密码是否正确，正确时生成 admin token 存入 Redis。
     *
     * @param password 输入的密码
     * @return 包含 adminToken 的响应，密码错误时返回错误信息
     */
    ApiResponse<Map<String, Object>> login(String password);

    /**
     * 验证管理员 token 是否有效
     *
     * @param adminToken 管理员令牌
     * @return 是否有效
     */
    boolean validateToken(String adminToken);

    /**
     * 获取所有已提交的列表
     *
     * @return 提交列表（包含 ID、步骤、完成状态、创建时间等）
     */
    ApiResponse<Object> getSubmissionList();

    /**
     * 获取单个提交的完整详情
     *
     * 包括基础信息、照片列表（不含二进制数据）、左右两侧自评数据。
     *
     * @param submissionId 提交记录ID
     * @return 完整的提交详情
     */
    ApiResponse<Map<String, Object>> getSubmissionDetail(Long submissionId);

    /**
     * 导出单个提交的 PDF
     *
     * 生成包含基础信息、照片（一行一张大图）、自评表格的 PDF 文件。
     *
     * @param submissionId 提交记录ID
     * @return PDF 文件的字节数组输出流
     */
    ByteArrayOutputStream exportPdf(Long submissionId);
}
