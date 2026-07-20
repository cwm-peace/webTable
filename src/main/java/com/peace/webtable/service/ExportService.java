package com.peace.webtable.service;

import java.io.ByteArrayOutputStream;

/**
 * Excel 导出服务接口
 *
 * 职责：将所有已完成提交的数据导出为 Excel 文件。
 * 导出的 Excel 包含基础信息和接受程度自评 Sheet。
 * 导出时按提交分页查询关联数据，避免一次性加载所有数据库记录。
 */
public interface ExportService {

    /**
     * 导出所有已完成提交的数据为 Excel
     *
     * 查询所有 completed=true 的提交记录，关联查询三步数据，
     * 生成包含基础信息和接受程度自评的 Excel 工作簿。
     *
     * @return Excel 文件的字节数组输出流
     */
    ByteArrayOutputStream exportAllToExcel();
}
