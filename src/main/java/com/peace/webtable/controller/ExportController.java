package com.peace.webtable.controller;

import com.peace.webtable.service.ExportService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Excel 导出控制器
 *
 * 职责：处理 Excel 导出的 HTTP 请求。
 * 将所有已完成提交的数据导出为 .xlsx 文件，包含三个 Sheet。
 *
 * 接口路径：/api/export
 */
@Slf4j
@RestController
@RequestMapping("/api/export")
public class ExportController {

    private final ExportService exportService;

    public ExportController(ExportService exportService) {
        this.exportService = exportService;
    }

    /**
     * 导出所有已完成提交的数据为 Excel
     *
     * 返回 .xlsx 文件，文件名包含导出时间戳便于区分不同批次的导出。
     * 浏览器会触发文件下载。
     *
     * @return Excel 文件的二进制响应
     */
    @GetMapping("/all")
    public ResponseEntity<byte[]> exportAll() {
        log.info("收到 Excel 导出请求");

        ByteArrayOutputStream bos = exportService.exportAllToExcel();
        byte[] bytes = bos.toByteArray();

        // 生成带时间戳的文件名
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
        String filename = "webtable_export_" + timestamp + ".xlsx";
        String encodedFilename = URLEncoder.encode(filename, StandardCharsets.UTF_8);

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"; filename*=UTF-8''" + encodedFilename)
                .body(bytes);
    }
}
