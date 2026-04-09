package com.peace.webtable.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.peace.webtable.entity.AssessmentRightTemplate;
import org.apache.ibatis.annotations.Mapper;

/**
 * 右侧栏评估项目模板 Mapper 接口
 *
 * 提供 assessment_right_template 表的数据库操作能力。
 */
@Mapper
public interface AssessmentRightTemplateMapper extends BaseMapper<AssessmentRightTemplate> {
}
