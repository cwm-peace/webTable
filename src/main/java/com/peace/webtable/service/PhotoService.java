package com.peace.webtable.service;

import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.Photo;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * 附图服务接口
 *
 * 职责：处理照片的上传、查询和下载业务逻辑。
 * 照片按类别分组存储（自拍、裸照、狗屌、其他），每个类别最多 4 张。
 * 照片以二进制数据存储在数据库 photos 表中。
 */
public interface PhotoService {

    /**
     * 上传照片
     *
     * 将照片存储到 photos 表，按指定类别分组。
     *
     * @param submissionId 提交记录ID
     * @param category     照片类别：selfie/nude/dick/other
     * @param file         上传的照片文件
     * @return 操作结果
     */
    ApiResponse<Void> uploadPhoto(Long submissionId, String category, MultipartFile file);

    /**
     * 查询指定类别的照片列表（不含二进制数据，仅元信息）
     *
     * @param submissionId 提交记录ID
     * @param category     照片类别
     * @return 照片元信息列表
     */
    List<Photo> listPhotos(Long submissionId, String category);

    /**
     * 获取照片记录（含完整元信息，用于归属校验）
     *
     * @param photoId 照片记录ID
     * @return 照片记录对象
     */
    Photo getPhoto(Long photoId);

    /**
     * 下载照片
     *
     * @param photoId 照片记录ID
     * @return 照片二进制数据
     */
    byte[] downloadPhoto(Long photoId);

    /**
     * 获取照片 MIME 类型
     *
     * @param photoId 照片记录ID
     * @return 照片的 MIME 类型
     */
    String getPhotoType(Long photoId);

    /**
     * 删除照片
     *
     * @param photoId 照片记录ID
     * @return 操作结果
     */
    ApiResponse<Void> deletePhoto(Long photoId);
}
