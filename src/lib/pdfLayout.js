/**
 * PDF 的 A4 文本排版与分页：报告式版面，只用黑白灰三级颜色区分层级。
 * 按 Unicode 码点换行，保留长备注和段落；此模块只绘制文字与几何图形，
 * 不解释 HTML，也不为用户输入创建链接或 PDF 动作。
 */
import { rgb } from "pdf-lib";

export const A4 = [595.28, 841.89];
/** 左右页边距，正文与页眉页脚使用同一列宽。 */
const MARGIN = 46;
/** 正文可用宽度，供调用方计算表格列宽。 */
export const CONTENT_WIDTH = A4[0] - MARGIN * 2;
/** 正文顶端（页眉线以下）与底端（页脚线以上）。 */
const BODY_TOP = A4[1] - 62;
const BODY_BOTTOM = 64;

/** 纯黑白灰配色，保证打印与灰度阅读器上层级仍然清楚。 */
const INK = rgb(0.11, 0.12, 0.13);
const MUTED = rgb(0.42, 0.44, 0.47);
const SOFT = rgb(0.62, 0.64, 0.67);
const HAIRLINE = rgb(0.82, 0.83, 0.85);
const BAND = rgb(0.945, 0.95, 0.955);
const ZEBRA = rgb(0.972, 0.974, 0.978);
const FRAME = rgb(0.8, 0.81, 0.84);

/** 供调用方绘制少量文字时复用同一套灰阶。 */
export const PALETTE = Object.freeze({
  ink: INK,
  muted: MUTED,
  soft: SOFT,
  hairline: HAIRLINE,
  band: BAND,
  zebra: ZEBRA,
  frame: FRAME,
});

/**
 * 把文本按字体实际宽度分行；每个原始换行都会保留。
 * @param {string} text 待排版文字
 * @param {object} font pdf-lib 字体
 * @param {number} size 字号，单位 pt
 * @param {number} maxWidth 可用行宽，单位 pt
 * @returns {string[]} 有序文本行
 */
export function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for (const paragraph of String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    let width = 0;
    for (const character of paragraph) {
      const nextWidth = font.widthOfTextAtSize(character, size);
      if (line && width + nextWidth > maxWidth) {
        lines.push(line);
        line = "";
        width = 0;
      }
      line += character;
      width += nextWidth;
    }
    lines.push(line);
  }
  return lines;
}

/** 管理 A4 报告的版心位置、章节色带、字段网格、表格、照片页与页眉页脚。 */
export class PdfLayout {
  /**
   * 创建排版状态并打开第一页。
   * @param {object} document pdf-lib 文档实例
   * @param {object} font 已注册的中文字体
   * @param {{runningTitle?:string,footerNote?:string}} [options] 页眉标题与页脚说明
   * @returns {PdfLayout} 绑定文档与字体的排版实例
   */
  constructor(document, font, { runningTitle = "", footerNote = "" } = {}) {
    this.document = document;
    this.font = font;
    this.runningTitle = runningTitle;
    this.footerNote = footerNote;
    this.page = null;
    this.y = 0;
    /** 每页页眉显示的章节名，创建页面时记录，章节开始时更新本页。 */
    this.pageSections = [];
    this.currentSection = "";
    this.columns = null;
    this.zebra = false;
    this.newPage();
  }

  /**
   * 新建带固定页边距的页面。
   * @returns {object} 新建的 pdf-lib 页面
   */
  newPage() {
    this.page = this.document.addPage(A4);
    this.y = BODY_TOP;
    this.pageSections.push(this.currentSection);
    return this.page;
  }

  /**
   * 确保下一段有足够空间，页脚区域不参与正文排版。
   * @param {number} height 所需高度，单位 pt
   * @returns {void} 无返回值
   */
  ensureSpace(height) {
    if (this.y - height < BODY_BOTTOM) this.newPage();
  }

  /**
   * 绘制单行文本，只供本模块内部定位使用。
   * @param {string} text 单行文字
   * @param {number} x 起始横坐标
   * @param {number} y 基线纵坐标
   * @param {number} size 字号
   * @param {object} color 文字颜色
   * @returns {void} 无返回值
   */
  draw(text, x, y, size, color = INK) {
    if (!text) return;
    this.page.drawText(text, { x, y, size, font: this.font, color });
  }

  /**
   * 绘制整幅宽的细线。
   * @param {number} y 线段纵坐标
   * @param {{thickness?:number,color?:object,x?:number,width?:number}} [options] 线宽、颜色与起止
   * @returns {void} 无返回值
   */
  rule(y, { thickness = 0.6, color = HAIRLINE, x = MARGIN, width = CONTENT_WIDTH } = {}) {
    this.page.drawLine({
      start: { x, y },
      end: { x: x + width, y },
      thickness,
      color,
    });
  }

  /**
   * 绘制文档标题、标题下粗线与一行概要信息。
   * @param {string} text 文档标题
   * @param {{meta?:string}} [options] 概要信息
   * @returns {void} 无返回值
   */
  title(text, { meta = "" } = {}) {
    this.y -= 34;
    this.draw(text, MARGIN, this.y, 22, INK);
    this.y -= 13;
    this.rule(this.y, { thickness: 1.6, color: INK });
    this.y -= 17;
    if (meta) {
      this.draw(meta, MARGIN, this.y, 9, MUTED);
      this.y -= 6;
    }
  }

  /**
   * 绘制可跨页的文本块。
   * @param {string} text 正文文字
   * @param {object} [options] 字号、行距、块后间距和颜色
   * @returns {void} 无返回值
   */
  text(
    text,
    {
      size = 10,
      lineHeight = 16,
      after = 5,
      color = INK,
      x = MARGIN,
      maxWidth = CONTENT_WIDTH,
    } = {},
  ) {
    for (const line of wrapText(text, this.font, size, maxWidth)) {
      this.ensureSpace(lineHeight);
      this.y -= lineHeight;
      if (line) this.draw(line, x, this.y + 3.5, size, color);
    }
    this.y -= after;
  }

  /**
   * 绘制一级章节色带，并把页眉章节名切换到本节。
   * @param {string} title 章节标题
   * @returns {void} 无返回值
   */
  section(title) {
    this.ensureSpace(84);
    this.currentSection = title;
    this.pageSections[this.pageSections.length - 1] = title;
    this.y -= 12;
    const height = 25;
    this.y -= height;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y,
      width: CONTENT_WIDTH,
      height,
      color: BAND,
    });
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y,
      width: 3.5,
      height,
      color: INK,
    });
    this.draw(title, MARGIN + 14, this.y + 8, 11.5, INK);
    this.y -= 16;
  }

  /**
   * 绘制二级小节标题与下方细线。
   * @param {string} title 小节标题
   * @param {{note?:string}} [options] 标题右侧的补充说明
   * @returns {void} 无返回值
   */
  subheading(title, { note = "" } = {}) {
    this.ensureSpace(58);
    this.y -= 22;
    this.draw(title, MARGIN, this.y, 10.5, INK);
    if (note) {
      const width = this.font.widthOfTextAtSize(note, 8.5);
      this.draw(note, MARGIN + CONTENT_WIDTH - width, this.y, 8.5, MUTED);
    }
    this.y -= 5;
    this.rule(this.y);
    this.y -= 12;
  }

  /**
   * 绘制整幅宽的长字段：小号灰色标签加正文值。
   * @param {string} label 字段标签
   * @param {string} value 字段内容
   * @returns {void} 无返回值
   */
  fieldBlock(label, value) {
    this.ensureSpace(46);
    this.y -= 16;
    this.draw(label, MARGIN, this.y, 8.5, MUTED);
    this.y -= 4;
    this.text(value, { size: 10.5, lineHeight: 16, after: 0 });
    this.y -= 8;
    this.rule(this.y);
    this.y -= 4;
  }

  /**
   * 绘制两列字段网格；长内容字段请改用 fieldBlock。
   * @param {Array<{label:string,value:string}>} entries 字段标签与内容
   * @returns {void} 无返回值
   */
  fieldGrid(entries) {
    const gap = 26;
    const cellWidth = (CONTENT_WIDTH - gap) / 2;
    const columns = [MARGIN, MARGIN + cellWidth + gap];
    for (let index = 0; index < entries.length; index += 2) {
      const row = entries.slice(index, index + 2);
      const prepared = row.map((entry, column) => ({
        x: columns[column],
        label: entry.label,
        lines: wrapText(entry.value, this.font, 10.5, cellWidth),
      }));
      const lineCount = Math.max(
        1,
        ...prepared.map((cell) => cell.lines.length),
      );
      const height = 17 + lineCount * 15 + 7;
      // 单个单元格超过整页可用高度时退回长字段排版，避免死循环。
      if (height > BODY_TOP - BODY_BOTTOM) {
        for (const entry of row) this.fieldBlock(entry.label, entry.value);
        continue;
      }
      this.ensureSpace(height);
      this.y -= 17;
      for (const cell of prepared) this.draw(cell.label, cell.x, this.y, 8.5, MUTED);
      this.y -= 3;
      for (let line = 0; line < lineCount; line += 1) {
        this.y -= 15;
        for (const cell of prepared)
          if (cell.lines[line]) this.draw(cell.lines[line], cell.x, this.y + 3.5, 10.5, INK);
      }
      this.y -= 7;
      this.rule(this.y);
      this.y -= 4;
    }
  }

  /**
   * 绘制带左边框的提示块，用于字体替换等需要用户注意的说明。
   * @param {string} text 提示文字
   * @returns {void} 无返回值
   */
  note(text) {
    const lines = wrapText(text, this.font, 9.5, CONTENT_WIDTH - 30);
    const height = lines.length * 14 + 18;
    this.ensureSpace(height + 14);
    this.y -= 10 + height;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y,
      width: CONTENT_WIDTH,
      height,
      borderColor: HAIRLINE,
      borderWidth: 0.7,
    });
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y,
      width: 3.5,
      height,
      color: INK,
    });
    lines.forEach((line, index) => {
      if (line) this.draw(line, MARGIN + 16, this.y + height - 14 - index * 14, 9.5, INK);
    });
    this.y -= 10;
  }

  /**
   * 记录表格列定义并绘制表头；行高不足换页时会重绘表头。
   * @param {Array<{label:string,width:number}>} columns 列标题与宽度
   * @returns {void} 无返回值
   */
  tableHead(columns) {
    this.columns = columns;
    this.zebra = false;
    this.drawHead();
  }

  /**
   * 绘制当前列定义的表头；换页重绘时保持斑马纹状态不变。
   * @returns {void} 无返回值
   */
  drawHead() {
    const columns = this.columns || [];
    this.ensureSpace(42);
    let x = MARGIN;
    this.y -= 14;
    for (const column of columns) {
      this.draw(column.label, x, this.y, 8.5, MUTED);
      x += column.width;
    }
    this.y -= 5;
    this.rule(this.y, { thickness: 0.9, color: SOFT });
    this.y -= 8;
  }

  /**
   * 绘制一行表格内容，超长单元格按可用高度跨页续排。
   * @param {Array<{text:string,width:number,badge?:boolean}>} cells 单元格内容与宽度
   * @returns {void} 无返回值
   */
  tableRow(cells) {
    const size = 9.5;
    const lineHeight = 13.5;
    const padding = 6;
    const columns = this.columns || [];
    let x = MARGIN;
    const prepared = cells.map((cell, index) => {
      const width = cell.width ?? columns[index]?.width ?? 0;
      const cellX = x;
      x += width;
      return {
        ...cell,
        x: cellX,
        width,
        lines: cell.badge
          ? [cell.text]
          : wrapText(cell.text, this.font, size, width - 12),
      };
    });
    const total = Math.max(1, ...prepared.map((cell) => cell.lines.length));
    const shaded = this.zebra;
    this.zebra = !this.zebra;
    let drawn = 0;
    while (drawn < total) {
      let capacity = Math.floor(
        (this.y - BODY_BOTTOM - padding * 2) / lineHeight,
      );
      // 连一行都放不下时必须先换页，否则内容会压到页脚。
      if (capacity < 1) {
        this.newPage();
        this.drawHead();
        capacity = Math.floor(
          (this.y - BODY_BOTTOM - padding * 2) / lineHeight,
        );
      }
      const take = Math.min(total - drawn, Math.max(1, capacity));
      const height = take * lineHeight + padding * 2;
      this.y -= height;
      if (shaded)
        this.page.drawRectangle({
          x: MARGIN,
          y: this.y,
          width: CONTENT_WIDTH,
          height,
          color: ZEBRA,
        });
      for (const cell of prepared) {
        const lines = cell.lines.slice(drawn, drawn + take);
        lines.forEach((line, index) => {
          const baseline = this.y + height - padding - lineHeight * index - 6;
          if (!line) return;
          if (cell.badge) {
            const width = this.font.widthOfTextAtSize(line, size);
            this.page.drawRectangle({
              x: cell.x + 5,
              y: baseline - 3.5,
              width: width + 12,
              height: 15,
              color: BAND,
              borderColor: HAIRLINE,
              borderWidth: 0.5,
            });
            this.draw(line, cell.x + 11, baseline, size, INK);
          } else this.draw(line, cell.x + 6, baseline, size, INK);
        });
      }
      this.y -= 1;
      drawn += take;
      if (drawn < total) {
        this.newPage();
        this.drawHead();
      }
    }
  }

  /**
   * 在独立页面展示一张照片，带细边框、标题与说明。
   * @param {object} image 已嵌入的 pdf-lib 图片
   * @param {string} title 分类和槽位名称
   * @param {string} caption 附件名称与处理方式
   * @param {{section?:string}} [options] 该页页眉显示的章节名
   * @returns {void} 无返回值
   */
  photo(image, title, caption, { section = title } = {}) {
    this.currentSection = section;
    this.newPage();
    this.y -= 26;
    this.draw(title, MARGIN, this.y, 15, INK);
    this.y -= 6;
    this.rule(this.y, { thickness: 1.2, color: INK });
    this.y -= 16;
    for (const line of wrapText(caption, this.font, 9, CONTENT_WIDTH)) {
      this.y -= 13;
      this.draw(line, MARGIN, this.y + 3, 9, MUTED);
    }
    this.y -= 14;
    const availableWidth = CONTENT_WIDTH;
    const availableHeight = this.y - BODY_BOTTOM;
    const scale = Math.min(
      availableWidth / image.width,
      availableHeight / image.height,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    const x = MARGIN + (availableWidth - width) / 2;
    const y = BODY_BOTTOM + (availableHeight - height) / 2;
    this.page.drawRectangle({
      x: x - 5,
      y: y - 5,
      width: width + 10,
      height: height + 10,
      borderColor: FRAME,
      borderWidth: 0.7,
    });
    this.page.drawImage(image, { x, y, width, height });
    this.y = BODY_BOTTOM;
  }

  /**
   * 为全部页面绘制页眉、页脚与页码，在所有正文和照片绘制后调用。
   * @returns {void} 无返回值
   */
  finish() {
    const pages = this.document.getPages();
    const total = pages.length;
    pages.forEach((page, index) => {
      const section = this.pageSections[index] || "";
      // 首页已有大标题，不再重复页眉。
      const showHeader = index > 0;
      if (this.runningTitle && showHeader)
        page.drawText(this.runningTitle, {
          x: MARGIN,
          y: A4[1] - 44,
          size: 8.5,
          font: this.font,
          color: MUTED,
        });
      if (section && showHeader) {
        const width = this.font.widthOfTextAtSize(section, 8.5);
        page.drawText(section, {
          x: MARGIN + CONTENT_WIDTH - width,
          y: A4[1] - 44,
          size: 8.5,
          font: this.font,
          color: MUTED,
        });
      }
      page.drawLine({
        start: { x: MARGIN, y: A4[1] - 52 },
        end: { x: MARGIN + CONTENT_WIDTH, y: A4[1] - 52 },
        thickness: 0.6,
        color: HAIRLINE,
      });
      page.drawLine({
        start: { x: MARGIN, y: 50 },
        end: { x: MARGIN + CONTENT_WIDTH, y: 50 },
        thickness: 0.6,
        color: HAIRLINE,
      });
      if (this.footerNote)
        page.drawText(this.footerNote, {
          x: MARGIN,
          y: 36,
          size: 8,
          font: this.font,
          color: MUTED,
        });
      const label = `${index + 1} / ${total}`;
      page.drawText(label, {
        x: MARGIN + CONTENT_WIDTH - this.font.widthOfTextAtSize(label, 8),
        y: 36,
        size: 8,
        font: this.font,
        color: MUTED,
      });
    });
  }
}
