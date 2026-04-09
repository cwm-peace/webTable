package com.peace.webtable.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 接受程度自评实体类（左侧栏，第3步）
 *
 * 对应数据库 assessment_left 表，存储用户对各类项目接受程度的自评。
 * 类型包括：性奴(淫奴)、狗奴、玩偶奴/性玩具、家奴等。
 * 级别分为 A-E 五级（A-超级喜欢 至 E-绝对不接受）。
 */
@Data
@TableName("assessment_left")
public class AssessmentLeft {

    /** 主键ID，自增 */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联的提交ID */
    private Long submissionId;

    /** 类型名称（性奴、狗奴、玩偶奴、家奴等） */
    private String typeName;

    /** 项目名称（如强奸、轮奸、口爆等） */
    private String itemName;

    /** 级别：A-超级喜欢 B-喜欢 C-不喜欢但接受 D-强迫才接受 E-绝对不接受 */
    private String level;

    /** 备注 */
    private String remark;

    /** 行排序号 */
    private Integer rowOrder;
}
