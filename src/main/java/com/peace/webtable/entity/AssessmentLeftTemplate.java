package com.peace.webtable.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 左侧栏评估项目模板实体类
 *
 * 对应数据库 assessment_left_template 表，存储评估项目的预设模板。
 * 不关联具体提交记录，所有用户共享同一套模板。
 * 新用户创建提交时，前端根据模板初始化表格行数据。
 */
@Data
@TableName("assessment_left_template")
public class AssessmentLeftTemplate {

    /** 主键ID，自增 */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 类型名称 */
    private String typeName;

    /** 项目名称 */
    private String itemName;

    /** 行排序号 */
    private Integer rowOrder;
}
