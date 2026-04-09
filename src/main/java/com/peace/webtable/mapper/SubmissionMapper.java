package com.peace.webtable.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.peace.webtable.entity.Submission;
import org.apache.ibatis.annotations.Mapper;

/**
 * 提交主表 Mapper 接口
 *
 * 提供 submissions 表的数据库操作能力。
 * 继承 MyBatis-Plus BaseMapper，内置 CRUD 方法无需手写 SQL。
 */
@Mapper
public interface SubmissionMapper extends BaseMapper<Submission> {
}
