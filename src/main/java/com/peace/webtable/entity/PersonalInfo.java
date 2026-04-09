package com.peace.webtable.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 基础信息实体类（第1步）
 *
 * 对应数据库 personal_info 衴，存储用户的个人基础信息。
 * 每个提交对应一条记录，包含范本中所有基础字段：
 * 基本身体信息、联系方式、性经历相关数据等。
 */
@Data
@TableName("personal_info")
public class PersonalInfo {

    /** 主键ID，自增 */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联的提交ID */
    private Long submissionId;

    /** 名字 */
    private String name;

    /** 身高cm */
    private String height;

    /** 体重kg */
    private String weight;

    /** 学历 */
    private String education;

    /** 职业 */
    private String occupation;

    /** 鞋码EU */
    private String shoeSize;

    /** 所在地(省) */
    private String province;

    /** 所在地(市) */
    private String city;

    /** QQ号 */
    private String qq;

    /** 微信号 */
    private String wechat;

    /** 微博名 */
    private String weibo;

    /** 电话号码 */
    private String phone;

    /** 第一次自慰年龄 */
    private String firstMasturbationAge;

    /** 破处年龄 */
    private String firstSexAge;

    /** 是否单身 */
    private String isSingle;

    /** 是否绿过伴侣 */
    private String cheatedOnPartner;

    /** 是否被伴侣绿过 */
    private String beenCheated;

    /** 最长带锁时间 */
    private String longestLockTime;

    /** 做爱频率 */
    private String sexFrequency;

    /** 自慰频率 */
    private String masturbationFrequency;

    /** 自慰工具 */
    private String masturbationTool;

    /** 菊穴可完全插入尺寸(直径*长度cm) */
    private String analInsertableSize;

    /** 尿道可完全插入尺寸(直径*长度cm) */
    private String urethraInsertableSize;

    /** 犬龄(做犬的时间) */
    private String dogAge;

    /** 约调次数 */
    private String meetingCount;

    /** 侍主人数 */
    private String masterCount;

    /** 精液量ml */
    private String semenVolume;

    /** 每日最高射精次数 */
    private String dailyMaxEjaculation;

    /** 喜欢被叫的称呼 */
    private String preferredName;

    /** 一句话形容自己 */
    private String selfDescription;

    /** 备注 */
    private String remark;

    /** 创建时间 */
    private LocalDateTime createTime;

    /** 更新时间 */
    private LocalDateTime updateTime;
}
