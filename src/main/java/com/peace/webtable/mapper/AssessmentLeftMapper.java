package com.peace.webtable.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.peace.webtable.entity.AssessmentLeft;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Delete;

/**
 * 接受程度自评（左侧栏）Mapper 接口
 *
 * 提供 assessment_left 表的数据库操作能力。
 */
@Mapper
public interface AssessmentLeftMapper extends BaseMapper<AssessmentLeft> {

    /**
     * 根据提交ID删除所有左侧自评记录
     *
     * @param submissionId 提交记录ID
     * @return 删除的记录数
     */
    @Delete("DELETE FROM assessment_left WHERE submission_id = #{submissionId}")
    int deleteBySubmissionId(@Param("submissionId") Long submissionId);
}
