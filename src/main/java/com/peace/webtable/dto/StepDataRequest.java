package com.peace.webtable.dto;

import lombok.Data;

import java.util.List;

/**
 * 步骤数据请求体
 *
 * 职责：封装前端提交的某一步骤的所有行数据。
 * 前端在保存或切换步骤时，将当前步骤表格中的所有行通过此对象发送到后端。
 * 后端接收后执行全量替换：删除旧数据，插入新数据。
 *
 * 泛型 T 为具体的行数据类型（PersonalInfo/Preference/Remark）。
 *
 * @param <T> 行数据类型
 */
@Data
public class StepDataRequest<T> {

    /** 该步骤的所有行数据列表 */
    private List<T> rows;
}
