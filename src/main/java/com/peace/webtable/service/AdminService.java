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
     * @param clientIdentifier 客户端标识（通常为远端 IP，用于登录限流）
     * @return 包含 adminToken 的响应，密码错误时返回错误信息
     */
    ApiResponse<Map<String, Object>> login(String password, String clientIdentifier);

    /**
     * 管理员退出登录
     *
     * 删除 Redis 中的管理员 token，使当前 token 立即失效。
     *
     * @param adminToken 管理员令牌
     * @return 操作结果
     */
    ApiResponse<Void> logout(String adminToken);

    /**
     * 验证管理员 token 是否有效
     *
     * @param adminToken 管理员令牌
     * @return 是否有效
     */
    boolean validateToken(String adminToken);

    /**
     * 校验提交记录是否已经最终提交。
     *
     * 管理端只能查看和下载已完成提交的数据，避免通过猜测 ID 访问仍在填写中的草稿。
     *
     * @param submissionId 提交记录ID
     * @return 是否为已完成提交
     */
    boolean validateCompletedSubmission(Long submissionId);

    /**
     * 分页获取已提交列表
     *
     * 只返回当前页必要字段，不暴露 session token，避免管理员列表在提交量增长后一次性加载过多数据。
     *
     * @param page 当前页码，从 1 开始
     * @param pageSize 每页数量，服务端会限制最大值
     * @return 分页提交列表（包含 records、total、page、pageSize、totalPages）
     */
    ApiResponse<Map<String, Object>> getSubmissionList(long page, long pageSize);

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
