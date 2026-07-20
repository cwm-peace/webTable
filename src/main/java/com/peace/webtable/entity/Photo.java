package com.peace.webtable.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 附图实体类（第2步）
 *
 * 对应数据库 photos 表，存储用户上传的照片。
 * 支持多个照片类别（自拍、裸照、狗屌、其他），每个类别最多 4 张。
 * 照片以 LONGBLOB 二进制形式存储在数据库中，服务层限制单张最大 50MB。
 */
@Data
@TableName("photos")
public class Photo {

    /** 主键ID，自增 */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联的提交ID */
    private Long submissionId;

    /** 照片类别：selfie-自拍 nude-裸照 dick-狗屌 other-其他 */
    private String photoCategory;

    /** 同类别内的排序号 */
    private Integer photoOrder;

    /** 照片二进制数据（LONGBLOB，服务层限制最大 50MB） */
    private byte[] photoData;

    /** 照片原始文件名 */
    private String photoName;

    /** 照片 MIME 类型（如 image/jpeg） */
    private String photoType;

    /** 创建时间 */
    private LocalDateTime createTime;
}
