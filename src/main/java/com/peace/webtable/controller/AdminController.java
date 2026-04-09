package com.peace.webtable.controller;

import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.service.AdminService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * 管理员控制器
 *
 * 职责：处理管理员系统的 HTTP 请求。
 * 包括登录验证、提交列表查询、单个提交详情查询、PDF 导出。
 * 需要通过 X-Admin-Token 请求头验证管理员身份（登录接口除外）。
 *
 * 接口路径：/api/admin
 */
@Slf4j
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    /**
     * 管理员登录
     *
     * 验证密码，成功返回 adminToken。
     *
     * @param body 包含 password 的请求体
     * @return 包含 adminToken 的响应
     */
    @PostMapping("/login")
    public ApiResponse<Map<String, Object>> login(@RequestBody Map<String, String> body) {
        String password = body.get("password");
        log.info("收到管理员登录请求");
        return adminService.login(password);
    }

    /**
     * 获取所有已提交的列表
     *
     * 需要管理员 token 验证。
     *
     * @param adminToken 管理员令牌（从请求头获取）
     * @return 提交列表
     */
    @GetMapping("/submissions")
    public ApiResponse<Object> getSubmissionList(@RequestHeader("X-Admin-Token") String adminToken) {
        if (!adminService.validateToken(adminToken)) {
            return ApiResponse.error(401, "管理员未登录或 token 已过期");
        }
        log.info("获取提交列表");
        return adminService.getSubmissionList();
    }

    /**
     * 获取单个提交的完整详情
     *
     * @param adminToken 管理员令牌
     * @param submissionId 提交记录ID
     * @return 完整详情（基础信息+照片+自评）
     */
    @GetMapping("/submissions/{id}")
    public ApiResponse<Map<String, Object>> getSubmissionDetail(
            @RequestHeader("X-Admin-Token") String adminToken,
            @PathVariable("id") Long submissionId) {
        if (!adminService.validateToken(adminToken)) {
            return ApiResponse.error(401, "管理员未登录或 token 已过期");
        }
        log.info("获取提交详情：submissionId={}", submissionId);
        return adminService.getSubmissionDetail(submissionId);
    }

    /**
     * 导出单个提交的 PDF
     *
     * @param adminToken 管理员令牌
     * @param submissionId 提交记录ID
     * @return PDF 文件的二进制响应
     */
    @GetMapping("/export-pdf/{id}")
    public ResponseEntity<byte[]> exportPdf(
            @RequestHeader("X-Admin-Token") String adminToken,
            @PathVariable("id") Long submissionId) {
        if (!adminService.validateToken(adminToken)) {
            return ResponseEntity.status(401).build();
        }

        log.info("收到 PDF 导出请求：submissionId={}", submissionId);

        ByteArrayOutputStream bos = adminService.exportPdf(submissionId);
        byte[] bytes = bos.toByteArray();

        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
        String filename = "webtable_" + submissionId + "_" + timestamp + ".pdf";
        String encodedFilename;
        try {
            encodedFilename = URLEncoder.encode(filename, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            encodedFilename = filename;
        }

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + encodedFilename + "\"")
                .body(bytes);
    }
}
