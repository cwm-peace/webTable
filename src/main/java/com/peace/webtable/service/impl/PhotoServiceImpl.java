package com.peace.webtable.service.impl;

import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.Photo;
import com.peace.webtable.mapper.PhotoMapper;
import com.peace.webtable.service.PhotoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;

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
        if (file == null || file.isEmpty()) {
            return ApiResponse.error("上传文件不能为空");
        }

        if (file.getSize() > 50 * 1024 * 1024) {
            return ApiResponse.error("照片大小不能超过 50MB");
        }

        // 文件类型白名单校验：只允许常见图片格式
        String contentType = file.getContentType();
        if (contentType == null || !contentType.matches("image/(jpeg|png|gif|webp|bmp)")) {
            log.warn("文件类型校验失败：submissionId={}, contentType={}", submissionId, contentType);
            return ApiResponse.error("只支持 JPG、PNG、GIF、WebP、BMP 格式的图片");
        }

        try {
            // 计算同类别内的下一个排序号
            Long count = photoMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<Photo>()
                            .eq("submission_id", submissionId)
                            .eq("photo_category", category));

            Photo photo = new Photo();
            photo.setSubmissionId(submissionId);
            photo.setPhotoCategory(category);
            photo.setPhotoOrder(count.intValue() + 1);
            photo.setPhotoData(file.getBytes());
            // 使用安全的文件名（去除路径分隔符，防止路径遍历攻击）
            String originalName = file.getOriginalFilename();
            photo.setPhotoName(originalName != null ? originalName.replaceAll("[/\\\\]", "") : "unnamed");
            photo.setPhotoType(contentType);
            photo.setCreateTime(LocalDateTime.now());
            photoMapper.insert(photo);

            log.info("照片上传成功：submissionId={}, category={}, fileName={}, size={}KB",
                    submissionId, category, file.getOriginalFilename(), file.getSize() / 1024);
            return ApiResponse.ok();

        } catch (IOException e) {
            log.error("照片上传失败：submissionId={}, category={}", submissionId, category, e);
            return ApiResponse.error("照片上传失败，请重试");
        }
    }

    /**
     * 查询照片列表：不返回二进制数据，仅返回元信息
     * 这样前端可以展示缩略图或文件名，点击时再单独下载
     */
    @Override
    public List<Photo> listPhotos(Long submissionId, String category) {
        return photoMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<Photo>()
                        .eq("submission_id", submissionId)
                        .eq("photo_category", category)
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
