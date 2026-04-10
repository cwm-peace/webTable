package com.peace.webtable.controller;

import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.Photo;
import com.peace.webtable.service.FormService;
import com.peace.webtable.service.PhotoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * 附图控制器
 *
 * 职责：处理照片上传、查询、下载和删除的 HTTP 请求。
 * 照片按类别分组（selfie-自拍 nude-裸照 dick-狗屌 other-其他），
 * 每个类别可上传多张照片。
 *
 * 接口路径：/api/photo
 */
@Slf4j
@RestController
@RequestMapping("/api/photo")
public class PhotoController {

    private final PhotoService photoService;
    private final FormService formService;

    public PhotoController(PhotoService photoService, FormService formService) {
        this.photoService = photoService;
        this.formService = formService;
    }

    /**
     * 上传照片
     *
     * @param sessionToken 会话令牌
     * @param submissionId  提交记录ID
     * @param category      照片类别（selfie/nude/dick/other）
     * @param file          上传的照片文件
     * @return 操作结果
     */
    @PostMapping("/{submissionId}")
    public ApiResponse<Void> uploadPhoto(@RequestHeader("X-Session-Token") String sessionToken,
                                         @PathVariable Long submissionId,
                                         @RequestParam("category") String category,
                                         @RequestParam("file") MultipartFile file) {
        if (!formService.validateSession(sessionToken, submissionId)) {
            return ApiResponse.error(403, "当前草稿无权访问或已失效");
        }
        log.info("收到照片上传请求：submissionId={}, category={}, fileName={}",
                submissionId, category, file.getOriginalFilename());
        return photoService.uploadPhoto(submissionId, category, file);
    }

    /**
     * 查询指定类别的照片列表（仅元信息，不含二进制数据）
     *
     * @param sessionToken 会话令牌
     * @param submissionId  提交记录ID
     * @param category      照片类别
     * @return 照片元信息列表
     */
    @GetMapping("/list/{submissionId}")
    public ApiResponse<List<Photo>> listPhotos(@RequestHeader("X-Session-Token") String sessionToken,
                                               @PathVariable Long submissionId,
                                               @RequestParam("category") String category) {
        if (!formService.validateSession(sessionToken, submissionId)) {
            return ApiResponse.error(403, "当前草稿无权访问或已失效");
        }
        log.info("查询照片列表：submissionId={}, category={}", submissionId, category);
        List<Photo> photos = photoService.listPhotos(submissionId, category);
        return ApiResponse.ok(photos);
    }

    /**
     * 下载照片
     *
     * @param sessionToken 会话令牌
     * @param photoId       照片记录ID
     * @return 照片的二进制响应
     */
    @GetMapping("/download/{photoId}")
    public ResponseEntity<byte[]> downloadPhoto(@RequestHeader("X-Session-Token") String sessionToken,
                                                @PathVariable Long photoId) {
        Photo photo = photoService.getPhoto(photoId);
        if (photo == null) {
            return ResponseEntity.notFound().build();
        }
        if (!formService.validateSession(sessionToken, photo.getSubmissionId())) {
            return ResponseEntity.status(403).build();
        }

        log.info("收到照片下载请求：photoId={}", photoId);

        byte[] photoData = photo.getPhotoData();
        if (photoData == null) {
            return ResponseEntity.notFound().build();
        }

        MediaType mediaType = MediaType.parseMediaType(
                photo.getPhotoType() != null ? photo.getPhotoType() : "image/jpeg");

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .body(photoData);
    }

    /**
     * 删除照片
     *
     * @param sessionToken 会话令牌
     * @param photoId       照片记录ID
     * @return 操作结果
     */
    @DeleteMapping("/{photoId}")
    public ApiResponse<Void> deletePhoto(@RequestHeader("X-Session-Token") String sessionToken,
                                         @PathVariable Long photoId) {
        Photo photo = photoService.getPhoto(photoId);
        if (photo == null) {
            return ApiResponse.error("照片不存在");
        }
        if (!formService.validateSession(sessionToken, photo.getSubmissionId())) {
            return ApiResponse.error(403, "当前草稿无权访问或已失效");
        }
        log.info("收到照片删除请求：photoId={}", photoId);
        return photoService.deletePhoto(photoId);
    }
}
