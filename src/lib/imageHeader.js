/** 按 JPEG、PNG、WebP、GIF 等图片容器规范检查元数据，图片字节不会发往服务器。 */

/**
 * 输入、派生和附件字节上限，以像素与压缩后字节衡量。
 * inputBytes/inputPixels/inputSide 是自动缩小门槛：超过后由本机缩小，不拒绝用户选择；
 * decodePixels/decodeSide 是浏览器解码硬上限，超过时明确报错，避免耗尽设备内存。
 * @type {{inputBytes:number,inputPixels:number,inputSide:number,decodePixels:number,decodeSide:number,attachmentBytes:number,originalPixels:number,originalSide:number,compressedSide:number,fallbackSide:number,previewSide:number,previewBytes:number}}
 */
export const IMAGE_LIMITS = Object.freeze({
  inputBytes: 64 * 1024 * 1024,
  inputPixels: 25_000_000,
  inputSide: 8192,
  decodePixels: 200_000_000,
  decodeSide: 32768,
  attachmentBytes: 2 * 1024 * 1024,
  originalPixels: 13_000_000,
  originalSide: 4096,
  compressedSide: 2560,
  fallbackSide: 2048,
  previewSide: 1600,
  previewBytes: 512 * 1024,
});

/** 可以按原字节保留并直接成为 PDF 附件的静态格式。 */
export const PRESERVABLE_MIMES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** 同一格式的 MIME 别名归入同一判别组，用于声明格式与内容格式的一致性检查。 */
const MIME_GROUPS = Object.freeze({
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/apng": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/x-ms-bmp": "bmp",
  "image/tiff": "tiff",
  "image/x-tiff": "tiff",
  "image/avif": "avif",
  "image/avif-sequence": "avif",
  "image/heic": "heif",
  "image/heif": "heif",
  "image/heic-sequence": "heif",
  "image/heif-sequence": "heif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/vnd.adobe.photoshop": "psd",
});

/**
 * 判断这份图片能否按原字节进入附件集合；动图与矢量图必须先转成静态位图。
 * @param {string} mime 图片内容格式。
 * @param {boolean} [animated] 是否为动图或多帧图片。
 * @returns {boolean} 可保留原字节时为 true。
 */
export function isPreservableFormat(mime, animated = false) {
  return !animated && PRESERVABLE_MIMES.includes(String(mime || ""));
}

/**
 * 判断尺寸是否超过自动缩小门槛。
 * @param {number} width 图片宽度（像素）。
 * @param {number} height 图片高度（像素）。
 * @returns {boolean} 超过边长或总像素门槛时为 true。
 */
export function exceedsInputLimits(width, height) {
  return (
    Math.max(width, height) > IMAGE_LIMITS.inputSide ||
    width * height > IMAGE_LIMITS.inputPixels
  );
}

/**
 * 等比缩放到长边不超过指定像素，不放大原始尺寸。
 * @param {number} width 原始宽度。
 * @param {number} height 原始高度。
 * @param {number} side 允许的最长边。
 * @returns {{width:number,height:number}} 至少为 1×1 的缩放结果。
 */
export function fitWithin(width, height, side) {
  const scale = Math.min(1, side / Math.max(1, width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * 图片校验错误，code 字段供调用方区分类型。
 * @param {string} code 错误代码。
 * @param {string} message 用户可读消息。
 * @returns {Error} 带 code 的错误实例。
 */
export function imageError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * 读取 4 字节 ASCII 标签。
 * @param {Uint8Array} bytes 文件字节。
 * @param {number} offset 起始偏移。
 * @returns {string} 4 字符标签。
 */
function tag(bytes, offset) {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

/**
 * 容器格式不满足条件时抛出统一错误。
 * @param {boolean} condition 期望的条件。
 * @returns {void} 失败时抛出 IMAGE_CORRUPT。
 */
function requireValid(condition) {
  if (!condition)
    throw imageError(
      "IMAGE_CORRUPT",
      "图片文件不完整或已损坏，请从相册重新选择。",
    );
}

/**
 * 计算 PNG CRC-32 校验和，起止位置不含长度与 CRC 本身。
 * @param {Uint8Array} bytes 文件字节。
 * @param {number} start 数据起始位置（含）。
 * @param {number} end 数据结束位置（不含）。
 * @returns {number} 32 位无符号校验和。
 */
function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 校验 PNG 块、静态标志和声明尺寸；多帧 APNG 只记录为动图。
 * @param {Uint8Array} bytes PNG 文件字节。
 * @returns {{mime:string,width:number,height:number,orientation:number,animated:boolean}} 图片元数据。
 */
function parsePng(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let foundIEND = false;
  let animated = false;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const kind = tag(bytes, offset + 4);
    const end = offset + 8 + length;
    requireValid(end + 4 <= bytes.length);
    requireValid(crc32(bytes, offset + 4, end) === view.getUint32(end));
    // APNG 的动画控制块只在静态 PNG 之外出现，交给解码器取第一帧。
    if (["acTL", "fcTL", "fdAT"].includes(kind)) animated = true;
    if (offset === 8) requireValid(kind === "IHDR");
    if (kind === "IHDR") {
      requireValid(offset === 8 && length === 13);
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const depth = bytes[offset + 16];
      const color = bytes[offset + 17];
      const validDepths = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      requireValid(
        validDepths[color] &&
          validDepths[color].includes(depth) &&
          bytes[offset + 18] === 0 &&
          bytes[offset + 19] === 0 &&
          bytes[offset + 20] === 0,
      );
    }
    if (kind === "eXIf") {
      for (let i = offset + 8; i + 12 <= end; i += 12) {
        const ifdTag = view.getUint16(i, false);
        const ifdType = view.getUint16(i + 2, false);
        if (ifdTag === 0x0112 && ifdType === 3) {
          orientation = view.getUint16(i + 8, false);
          break;
        }
      }
    }
    if (kind === "IEND") {
      requireValid(length === 0 && end + 4 === bytes.length);
      foundIEND = true;
      break;
    }
    offset = end + 4;
  }
  requireValid(foundIEND && width > 0 && height > 0);
  requireValid(orientation >= 1 && orientation <= 8);
  return { mime: "image/png", width, height, orientation, animated };
}

/**
 * 校验 JPEG 标记、Huffman 表与声明尺寸。
 * @param {Uint8Array} bytes JPEG 文件字节。
 * @returns {{mime:string,width:number,height:number,orientation:number,animated:boolean}} 图片元数据。
 */
function parseJpeg(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let scanned = false;

  while (offset + 2 <= bytes.length) {
    requireValid(
      bytes[offset] === 0xff &&
        bytes[offset + 1] !== 0x00 &&
        bytes[offset + 1] !== 0xff,
    );
    const marker = bytes[offset + 1];

    // EOI - End of Image
    if (marker === 0xd9) {
      scanned = true;
      offset += 2;
      break;
    }

    // RST0-RST7 和 SOI - 独立标记，无长度字段
    if (
      [0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8].includes(marker)
    ) {
      offset += 2;
      continue;
    }

    // SOS - Start of Scan，之后是压缩数据流
    if (marker === 0xda) {
      requireValid(offset + 4 <= bytes.length);
      const length = view.getUint16(offset + 2);
      requireValid(length >= 2 && offset + 2 + length <= bytes.length);
      offset += 2 + length;

      // 扫描压缩数据流直到找到 EOI
      while (offset + 1 < bytes.length) {
        if (bytes[offset] === 0xff) {
          const next = bytes[offset + 1];
          // 0xff 0x00 是转义的 0xff 数据
          if (next === 0x00) {
            offset += 2;
            continue;
          }
          // 0xff 0xd9 是 EOI
          if (next === 0xd9) {
            scanned = true;
            offset += 2;
            break;
          }
          // RST 标记在压缩流中也是合法的
          if (next >= 0xd0 && next <= 0xd7) {
            offset += 2;
            continue;
          }
          // 其他标记不应该出现在压缩流中
          requireValid(false);
        }
        offset++;
      }
      break;
    }

    // 其他带长度字段的标记
    requireValid(offset + 4 <= bytes.length);
    const length = view.getUint16(offset + 2);
    requireValid(length >= 2 && offset + 2 + length <= bytes.length);
    const start = offset + 4;
    const end = offset + 2 + length;

    // SOF - Start of Frame
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      requireValid(length >= 8);
      height = view.getUint16(start + 1);
      width = view.getUint16(start + 3);
      requireValid(width > 0 && height > 0);
    }

    // EXIF 方向信息
    if (
      marker === 0xe1 &&
      length >= 14 &&
      tag(bytes, start) === "Exif" &&
      bytes[start + 4] === 0 &&
      bytes[start + 5] === 0
    ) {
      const exifStart = start + 6;
      const littleEndian =
        bytes[exifStart] === 0x49 && bytes[exifStart + 1] === 0x49;
      const ifd0Offset = view.getUint32(exifStart + 4, littleEndian);
      if (exifStart + ifd0Offset + 2 <= end) {
        const entryCount = view.getUint16(exifStart + ifd0Offset, littleEndian);
        for (
          let i = 0;
          i < entryCount && exifStart + ifd0Offset + 2 + i * 12 + 12 <= end;
          i++
        ) {
          const entryOffset = exifStart + ifd0Offset + 2 + i * 12;
          const ifdTag = view.getUint16(entryOffset, littleEndian);
          const ifdType = view.getUint16(entryOffset + 2, littleEndian);
          if (ifdTag === 0x0112 && ifdType === 3) {
            orientation = view.getUint16(entryOffset + 8, littleEndian);
            break;
          }
        }
      }
    }

    offset = end;
  }

  requireValid(scanned && width > 0); // EOI 后允许有额外元数据（缩略图、厂商私有数据等）
  requireValid(orientation >= 1 && orientation <= 8); // EXIF 方向值必须在 1-8 范围内
  return { mime: "image/jpeg", width, height, orientation, animated: false };
}

/**
 * 校验 WebP RIFF 块、静态位流和声明尺寸；动画容器只记录为动图。
 * @param {Uint8Array} bytes WebP 文件字节。
 * @returns {{mime:string,width:number,height:number,orientation:number,animated:boolean}} 图片元数据。
 */
function parseWebp(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  requireValid(view.getUint32(4, true) + 8 === bytes.length);
  let offset = 12;
  let width = 0;
  let height = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let orientation = 1;
  let payloads = 0;
  let animated = false;
  while (offset < bytes.length) {
    requireValid(offset + 8 <= bytes.length);
    const kind = tag(bytes, offset);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    requireValid(end + (length & 1) <= bytes.length);
    if (kind === "ANIM" || kind === "ANMF") animated = true;
    if (kind === "VP8X") {
      requireValid(offset === 12 && length === 10);
      if (bytes[start] & 2) animated = true;
      requireValid((bytes[start] & 0xc1) === 0);
      canvasWidth =
        1 +
        bytes[start + 4] +
        (bytes[start + 5] << 8) +
        (bytes[start + 6] << 16);
      canvasHeight =
        1 +
        bytes[start + 7] +
        (bytes[start + 8] << 8) +
        (bytes[start + 9] << 16);
    } else if (kind === "VP8 ") {
      requireValid(
        length >= 10 &&
          (bytes[start] & 1) === 0 &&
          bytes[start + 3] === 0x9d &&
          bytes[start + 4] === 0x01 &&
          bytes[start + 5] === 0x2a,
      );
      width = view.getUint16(start + 6, true) & 0x3fff;
      height = view.getUint16(start + 8, true) & 0x3fff;
      payloads++;
    } else if (kind === "VP8L") {
      requireValid(length >= 5 && bytes[start] === 0x2f);
      const bits = view.getUint32(start + 1, true);
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >> 14) & 0x3fff);
      payloads++;
    } else if (kind === "EXIF") {
      const littleEndian = bytes[start] === 0x49 && bytes[start + 1] === 0x49;
      const ifd0Offset = view.getUint32(start + 4, littleEndian);
      if (start + ifd0Offset + 2 <= end) {
        const entryCount = view.getUint16(start + ifd0Offset, littleEndian);
        for (
          let i = 0;
          i < entryCount && start + ifd0Offset + 2 + i * 12 + 12 <= end;
          i++
        ) {
          const entryOffset = start + ifd0Offset + 2 + i * 12;
          const ifdTag = view.getUint16(entryOffset, littleEndian);
          const ifdType = view.getUint16(entryOffset + 2, littleEndian);
          if (ifdTag === 0x0112 && ifdType === 3) {
            orientation = view.getUint16(entryOffset + 8, littleEndian);
            break;
          }
        }
      }
    }
    offset = end + (length & 1);
  }
  if (animated) {
    // 动画 WebP 的帧在 ANMF 子块内，画布尺寸才是最终显示尺寸。
    requireValid(canvasWidth > 0 && canvasHeight > 0);
    width = canvasWidth;
    height = canvasHeight;
  } else {
    requireValid(payloads === 1);
    if (canvasWidth > 0 && canvasHeight > 0) {
      requireValid(width <= canvasWidth && height <= canvasHeight);
      width = canvasWidth;
      height = canvasHeight;
    }
  }
  requireValid(width > 0 && height > 0);
  requireValid(orientation >= 1 && orientation <= 8);
  return { mime: "image/webp", width, height, orientation, animated };
}

/**
 * 跳过一个 GIF 子块序列，起点为第一个长度字节。
 * @param {Uint8Array} bytes GIF 文件字节。
 * @param {number} offset 第一个子块长度字节的位置。
 * @returns {number} 终止长度字节之后的位置，越界时返回 -1。
 */
function skipGifSubBlocks(bytes, offset) {
  while (offset < bytes.length) {
    const size = bytes[offset];
    offset += 1;
    if (size === 0) return offset;
    offset += size;
  }
  return -1;
}

/**
 * 按 GIF 规范遍历数据块，统计帧数并识别动图。
 * @param {Uint8Array} bytes GIF 文件字节。
 * @returns {{mime:string,width:number,height:number,orientation:number,animated:boolean}} 图片元数据。
 */
function parseGif(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = String.fromCharCode(bytes[3], bytes[4], bytes[5]);
  requireValid(tag(bytes, 0) === "GIF8" && (version === "87a" || version === "89a"));
  requireValid(bytes.length >= 14);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  requireValid(width > 0 && height > 0);
  const packed = bytes[10];
  let offset = 13;
  if (packed & 0x80) offset += 3 * 2 ** ((packed & 7) + 1);
  requireValid(offset <= bytes.length);
  let frames = 0;
  let done = false;
  while (offset < bytes.length) {
    const marker = bytes[offset];
    if (marker === 0x3b) {
      done = true;
      break;
    }
    if (marker === 0x21) {
      // 扩展块：引导符、标签，随后是子块序列。
      requireValid(offset + 2 <= bytes.length);
      offset = skipGifSubBlocks(bytes, offset + 2);
    } else if (marker === 0x2c) {
      // 图像描述符：位置、尺寸、局部颜色表标志、LZW 最小码长和数据子块。
      requireValid(offset + 10 <= bytes.length);
      const localPacked = bytes[offset + 9];
      offset += 10;
      if (localPacked & 0x80) offset += 3 * 2 ** ((localPacked & 7) + 1);
      requireValid(offset + 1 <= bytes.length);
      offset = skipGifSubBlocks(bytes, offset + 1);
      frames += 1;
    } else {
      requireValid(false);
    }
    requireValid(offset >= 0 && offset <= bytes.length);
  }
  requireValid(done && frames > 0);
  return {
    mime: "image/gif",
    width,
    height,
    orientation: 1,
    animated: frames > 1,
  };
}

/**
 * 把内容格式归一化到判别组，兼容同一格式的多种 MIME 别名。
 * @param {string} mime 文件声明或探测到的 MIME。
 * @returns {string} 判别组名，未知格式返回空串。
 */
export function mimeGroup(mime) {
  return MIME_GROUPS[String(mime || "").trim().toLowerCase()] || "";
}

/**
 * 判断声明格式与内容格式是否属于同一组；任一未知时不做否定判断。
 * @param {string} declared 文件声明的 MIME。
 * @param {string} actual 按文件内容识别出的 MIME。
 * @returns {boolean} 不冲突时为 true。
 */
export function sameMimeGroup(declared, actual) {
  const left = mimeGroup(declared);
  const right = mimeGroup(actual);
  return !left || !right || left === right;
}

/**
 * 按文件头识别浏览器可解码但本文件未做结构校验的格式。
 * @param {Uint8Array|ArrayBuffer} input 文件字节或字节视图。
 * @returns {string} 识别出的 MIME，无法识别时返回空串。
 */
export function sniffMime(input) {
  // 调用方可能传入 file.arrayBuffer() 的结果，这里统一成字节视图。
  if (!(input instanceof Uint8Array) && !(input instanceof ArrayBuffer)) return "";
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 4) return "";
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (tag(bytes, 0) === "RIFF" && tag(bytes, 8) === "WEBP") return "image/webp";
  if (tag(bytes, 0) === "GIF8") return "image/gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a)
  )
    return "image/tiff";
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0)
    return "image/x-icon";
  if (bytes.length >= 12 && tag(bytes, 4) === "ftyp") {
    const brand = tag(bytes, 8);
    if (["avif", "avis"].includes(brand)) return "image/avif";
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"].includes(brand))
      return "image/heic";
    if (["mif1", "msf1"].includes(brand)) return "image/heif";
    return "";
  }
  // SVG 是文本格式，只看开头声明，避免把普通文本误判为图片。
  const head = new TextDecoder("utf-8")
    .decode(bytes.subarray(0, Math.min(bytes.length, 1024)))
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (
    /^<svg[\s>]/i.test(head) ||
    (/^<\?xml/i.test(head) && /<svg[\s>]/i.test(head)) ||
    (/^<!--/.test(head) && /<svg[\s>]/i.test(head))
  )
    return "image/svg+xml";
  return "";
}

/**
 * 在解码前检查图片类型、容器完整性和资源上限。
 * 超过自动缩小门槛的图片照常返回元数据，由处理流程缩小；
 * 只有超过浏览器解码硬上限或文件字节上限时才拒绝。
 * @param {ArrayBuffer|Uint8Array} input 完整图片字节，最大 64 MiB。
 * @returns {{mime:string,width:number,height:number,orientation:number,animated:boolean,displayWidth:number,displayHeight:number}} 尺寸包含方向修正前后值。
 * @throws {Error} 类型、结构或资源上限不符合要求时抛出带 code 的错误。
 */
export function inspectImage(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > IMAGE_LIMITS.inputBytes)
    throw imageError(
      "IMAGE_TOO_LARGE",
      `单张图片不能超过 ${IMAGE_LIMITS.inputBytes / (1024 * 1024)} MiB，请先在设备上压缩或缩小后再选择。`,
    );
  requireValid(bytes.length >= 12);
  let metadata;
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    )
  )
    metadata = parsePng(bytes);
  else if (bytes[0] === 0xff && bytes[1] === 0xd8) metadata = parseJpeg(bytes);
  else if (tag(bytes, 0) === "RIFF" && tag(bytes, 8) === "WEBP")
    metadata = parseWebp(bytes);
  else if (tag(bytes, 0) === "GIF8") metadata = parseGif(bytes);
  else
    throw imageError(
      "IMAGE_TYPE",
      "无法识别这种图片格式，请从相册重新选择，或先转换为 JPEG、PNG、WebP。",
    );
  requireValid(metadata.width > 0 && metadata.height > 0);
  if (
    Math.max(metadata.width, metadata.height) > IMAGE_LIMITS.decodeSide ||
    metadata.width * metadata.height > IMAGE_LIMITS.decodePixels
  )
    throw imageError(
      "IMAGE_DIMENSIONS",
      `图片尺寸 ${metadata.width}×${metadata.height} 过大，本机无法处理，请先在设备上裁剪或缩小。`,
    );
  const rotated = [5, 6, 7, 8].includes(metadata.orientation);
  return {
    ...metadata,
    displayWidth: rotated ? metadata.height : metadata.width,
    displayHeight: rotated ? metadata.width : metadata.height,
  };
}
