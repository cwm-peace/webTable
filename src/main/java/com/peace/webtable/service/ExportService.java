package com.peace.webtable.service;

import java.io.ByteArrayOutputStream;

/**
 * Excel 导出服务接口
 *
 * 职责：将所有已完成提交的数据导出为 Excel 文件。
 * 导出的 Excel 包含三个 Sheet：个人信息、喜好、备注。
 * 使用 SXSSFWorkbook 流式写入，支持大数据量导出而不占用过多内存。
 */
public interface ExportService {

    /**
     * 导出所有已完成提交的数据为 Excel
     *
     * 查询所有 completed=true 的提交记录，关联查询三步数据，
     * 生成包含三个 Sheet 的 Excel 工作簿。
     *
     * @return Excel 文件的字节数组输出流
     */
    ByteArrayOutputStream exportAllToExcel();
}
