package com.peace.webtable.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 右侧栏评估项目模板实体类
 *
 * 对应数据库 assessment_right_template 表，存储评估项目的预设模板。
 */
@Data
@TableName("assessment_right_template")
public class AssessmentRightTemplate {

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
