package com.peace.webtable.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.peace.webtable.entity.PersonalInfo;
import org.apache.ibatis.annotations.Mapper;

/**
 * 基础信息 Mapper 接口
 *
 * 提供 personal_info 表的数据库操作能力。
 * 每个提交对应一条记录，使用 MyBatis-Plus BaseMapper 提供 CRUD。
 */
@Mapper
public interface PersonalInfoMapper extends BaseMapper<PersonalInfo> {
}
