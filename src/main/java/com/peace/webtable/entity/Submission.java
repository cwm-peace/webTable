package com.peace.webtable.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 提交主表实体类
 *
 * 对应数据库 submissions 表，记录每次用户提交的基本信息。
 * 每个用户首次访问时创建一条记录，通过 session_token 与浏览器会话关联。
 */
@Data
@TableName("submissions")
public class Submission {

    /** 主键ID，自增 */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 会话令牌，唯一标识一次填写流程 */
    private String sessionToken;

    /** 当前步骤：1-基础信息 2-附图 3-接受程度自评 */
    private Integer currentStep;

    /** 是否已完成：0-未完成 1-已完成 */
    private Boolean completed;

    /** 创建时间 */
    private LocalDateTime createTime;

    /** 更新时间 */
    private LocalDateTime updateTime;
}
