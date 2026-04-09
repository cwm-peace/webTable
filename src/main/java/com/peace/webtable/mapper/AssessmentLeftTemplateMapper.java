package com.peace.webtable.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.peace.webtable.entity.AssessmentLeftTemplate;
import org.apache.ibatis.annotations.Mapper;

/**
 * 左侧栏评估项目模板 Mapper 接口
 *
 * 提供 assessment_left_template 表的数据库操作能力。
 * 模板数据从范本文件预初始化，新用户创建提交时加载模板初始化表格。
 */
@Mapper
public interface AssessmentLeftTemplateMapper extends BaseMapper<AssessmentLeftTemplate> {
}
