package com.peace.webtable.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.peace.webtable.entity.Photo;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Select;

/**
 * 附图 Mapper 接口
 *
 * 提供 photos 表的数据库操作能力。
 * 除 BaseMapper 内置方法外，额外提供按 submission_id 批量删除的能力。
 */
@Mapper
public interface PhotoMapper extends BaseMapper<Photo> {

    /**
     * 统计指定提交记录下所有照片二进制数据的总字节数。
     *
     * PDF 导出前先执行轻量聚合，避免在超出导出预算时把大体积 LONGBLOB 读入应用内存。
     *
     * @param submissionId 提交记录ID
     * @return 照片总字节数，未上传照片时为 0
     */
    @Select("SELECT COALESCE(SUM(OCTET_LENGTH(photo_data)), 0) FROM photos WHERE submission_id = #{submissionId}")
    Long sumPhotoDataBytesBySubmissionId(@Param("submissionId") Long submissionId);

    /**
     * 根据提交ID删除所有照片记录
     *
     * @param submissionId 提交记录ID
     * @return 删除的记录数
     */
    @Delete("DELETE FROM photos WHERE submission_id = #{submissionId}")
    int deleteBySubmissionId(@Param("submissionId") Long submissionId);
}
