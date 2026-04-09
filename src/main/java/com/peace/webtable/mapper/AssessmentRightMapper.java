package com.peace.webtable.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.peace.webtable.entity.AssessmentRight;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Delete;

/**
 * 接受程度自评（右侧栏）Mapper 接口
 *
 * 提供 assessment_right 表的数据库操作能力。
 */
@Mapper
public interface AssessmentRightMapper extends BaseMapper<AssessmentRight> {

    /**
     * 根据提交ID删除所有右侧自评记录
     *
     * @param submissionId 提交记录ID
     * @return 删除的记录数
     */
    @Delete("DELETE FROM assessment_right WHERE submission_id = #{submissionId}")
    int deleteBySubmissionId(@Param("submissionId") Long submissionId);
}
