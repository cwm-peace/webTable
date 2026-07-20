package com.peace.webtable.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.Photo;
import com.peace.webtable.mapper.PhotoMapper;
import com.peace.webtable.service.PhotoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 附图服务实现类
 *
 * 职责：实现照片的上传、查询、下载和删除业务逻辑。
 * 照片存储在独立的 photos 表中，按类别分组（自拍/裸照/狗屌/其他）。
 * 查询列表时不返回二进制数据（减少传输量），下载时单独获取。
 */
@Slf4j
@Service
public class PhotoServiceImpl implements PhotoService {

    /** 每个照片类别最多上传 4 张，与前端 4 槽位保持一致。 */
    private static final int MAX_PHOTOS_PER_CATEGORY = 4;
    /** 单张照片最大 50MB，与 Spring Multipart 配置保持一致。 */
    private static final long MAX_FILE_SIZE_BYTES = 50L * 1024 * 1024;
    /** 允许的业务照片类别。 */
    private static final Set<String> ALLOWED_CATEGORIES = Set.of("selfie", "nude", "dick", "other");

    private final PhotoMapper photoMapper;

    public PhotoServiceImpl(PhotoMapper photoMapper) {
        this.photoMapper = photoMapper;
    }

    /**
     * 上传照片
     *
     * 校验文件后存储到 photos 表，自动计算同类别内的排序号。
     */
    @Override
    public ApiResponse<Void> uploadPhoto(Long submissionId, String category, MultipartFile file) {
        String normalizedCategory = normalizeCategory(category);
        if (!ALLOWED_CATEGORIES.contains(normalizedCategory)) {
            log.warn("照片类别校验失败：submissionId={}, category={}", submissionId, category);
            return ApiResponse.error(400, "照片类别不正确");
        }

        if (file == null || file.isEmpty()) {
            return ApiResponse.error(400, "上传文件不能为空");
        }

        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            return ApiResponse.error(413, "照片大小不能超过 50MB");
        }

        // 文件类型白名单校验：只允许常见图片格式
        String contentType = file.getContentType();
        String normalizedContentType = contentType != null ? contentType.toLowerCase(Locale.ROOT) : "";
        if (!normalizedContentType.matches("image/(jpeg|png|gif|webp|bmp)")) {
            log.warn("文件类型校验失败：submissionId={}, contentType={}", submissionId, contentType);
            return ApiResponse.error(415, "只支持 JPG、PNG、GIF、WebP、BMP 格式的图片");
        }

        byte[] photoBytes;
        try {
            photoBytes = file.getBytes();
        } catch (IOException e) {
            log.error("照片读取失败：submissionId={}, category={}", submissionId, normalizedCategory, e);
            return ApiResponse.error("照片上传失败，请重试");
        }

        String detectedContentType = detectImageContentType(photoBytes);
        if (detectedContentType == null || !detectedContentType.equals(normalizedContentType)) {
            log.warn("图片内容校验失败：submissionId={}, declaredType={}, detectedType={}",
                    submissionId, normalizedContentType, detectedContentType);
            return ApiResponse.error(400, "图片内容与文件类型不匹配");
        }

        String originalName = file.getOriginalFilename();
        String safeFileName = originalName != null ? originalName.replaceAll("[/\\\\]", "") : "unnamed";
        if (safeFileName.isBlank()) {
            safeFileName = "unnamed";
        }

        for (int attempt = 1; attempt <= MAX_PHOTOS_PER_CATEGORY; attempt++) {
            List<Photo> existingPhotos = photoMapper.selectList(
                    new QueryWrapper<Photo>()
                            .eq("submission_id", submissionId)
                            .eq("photo_category", normalizedCategory)
                            .select("photo_order")
                            .orderByAsc("photo_order"));
            if (existingPhotos.size() >= MAX_PHOTOS_PER_CATEGORY) {
                return ApiResponse.error(400, "每个类别最多上传 4 张照片");
            }

            Photo photo = new Photo();
            photo.setSubmissionId(submissionId);
            photo.setPhotoCategory(normalizedCategory);
            photo.setPhotoOrder(nextPhotoOrder(existingPhotos));
            photo.setPhotoData(photoBytes);
            photo.setPhotoName(safeFileName);
            photo.setPhotoType(normalizedContentType);
            photo.setCreateTime(LocalDateTime.now());

            try {
                photoMapper.insert(photo);
            } catch (DuplicateKeyException e) {
                log.warn("照片槽位并发冲突，准备重试：submissionId={}, category={}, attempt={}",
                        submissionId, normalizedCategory, attempt);
                continue;
            }

            log.info("照片上传成功：submissionId={}, category={}, fileName={}, size={}KB",
                    submissionId, normalizedCategory, safeFileName, file.getSize() / 1024);
            return ApiResponse.ok();
        }

        return ApiResponse.error("照片上传冲突，请重试");
    }

    /**
     * 根据文件头识别图片真实 MIME 类型。
     *
     * 仅信任请求头中的 Content-Type 容易被伪造，因此上传前必须检查图片魔数。
     */
    private String detectImageContentType(byte[] bytes) {
        if (bytes == null || bytes.length < 4) {
            return null;
        }
        if (startsWith(bytes, new int[]{0xFF, 0xD8, 0xFF})) {
            return "image/jpeg";
        }
        if (startsWith(bytes, new int[]{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A})) {
            return "image/png";
        }
        if (startsWith(bytes, new int[]{0x47, 0x49, 0x46, 0x38, 0x37, 0x61})
                || startsWith(bytes, new int[]{0x47, 0x49, 0x46, 0x38, 0x39, 0x61})) {
            return "image/gif";
        }
        if (bytes.length >= 12
                && startsWith(bytes, new int[]{0x52, 0x49, 0x46, 0x46})
                && matchesAt(bytes, 8, new int[]{0x57, 0x45, 0x42, 0x50})) {
            return "image/webp";
        }
        if (startsWith(bytes, new int[]{0x42, 0x4D})) {
            return "image/bmp";
        }
        return null;
    }

    /**
     * 判断字节数组是否以指定无符号字节序列开头。
     */
    private boolean startsWith(byte[] bytes, int[] signature) {
        return matchesAt(bytes, 0, signature);
    }

    /**
     * 判断字节数组指定位置是否匹配无符号字节序列。
     */
    private boolean matchesAt(byte[] bytes, int offset, int[] signature) {
        if (bytes.length < offset + signature.length) {
            return false;
        }
        for (int i = 0; i < signature.length; i++) {
            if ((bytes[offset + i] & 0xFF) != signature[i]) {
                return false;
            }
        }
        return true;
    }

    /**
     * 归一化照片类别，避免大小写和首尾空格造成重复类别。
     */
    private String normalizeCategory(String category) {
        return category != null ? category.trim().toLowerCase(Locale.ROOT) : "";
    }

    /**
     * 选择 1-4 中第一个空闲照片槽位，删除后再次上传会补回空槽。
     */
    private int nextPhotoOrder(List<Photo> existingPhotos) {
        boolean[] used = new boolean[MAX_PHOTOS_PER_CATEGORY + 1];
        for (Photo existing : existingPhotos) {
            Integer order = existing.getPhotoOrder();
            if (order != null && order >= 1 && order <= MAX_PHOTOS_PER_CATEGORY) {
                used[order] = true;
            }
        }
        for (int order = 1; order <= MAX_PHOTOS_PER_CATEGORY; order++) {
            if (!used[order]) {
                return order;
            }
        }
        return existingPhotos.size() + 1;
    }

    /**
     * 查询照片列表：不返回二进制数据，仅返回元信息
     * 这样前端可以展示缩略图或文件名，点击时再单独下载
     */
    @Override
    public List<Photo> listPhotos(Long submissionId, String category) {
        String normalizedCategory = normalizeCategory(category);
        if (!ALLOWED_CATEGORIES.contains(normalizedCategory)) {
            return List.of();
        }
        return photoMapper.selectList(
                new QueryWrapper<Photo>()
                        .eq("submission_id", submissionId)
                        .eq("photo_category", normalizedCategory)
                        .orderByAsc("photo_order")
                        .select("id", "submission_id", "photo_category", "photo_order", "photo_name", "photo_type", "create_time"));
    }

    /**
     * 获取照片记录（含完整元信息，用于归属校验）
     */
    @Override
    public Photo getPhoto(Long photoId) {
        return photoMapper.selectById(photoId);
    }

    /**
     * 下载照片：返回完整的二进制数据
     */
    @Override
    public byte[] downloadPhoto(Long photoId) {
        Photo photo = photoMapper.selectById(photoId);
        return photo != null ? photo.getPhotoData() : null;
    }

    /**
     * 获取照片 MIME 类型
     */
    @Override
    public String getPhotoType(Long photoId) {
        Photo photo = photoMapper.selectById(photoId);
        return photo != null ? photo.getPhotoType() : null;
    }

    /**
     * 删除照片
     */
    @Override
    public ApiResponse<Void> deletePhoto(Long photoId) {
        photoMapper.deleteById(photoId);
        log.info("照片已删除：photoId={}", photoId);
        return ApiResponse.ok();
    }
}
