"""离线准备 PDF 字体：保留全部 Unicode 与排版特性，移除 hinting 并生成内容版本文件。"""
import argparse
import hashlib
from pathlib import Path

from fontTools import __version__, subset
from fontTools.ttLib import TTFont

SOURCE_SHA256 = "faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9"


def prepare(source: Path, destination: Path) -> Path:
    """校验官方源字体并输出精简文件；字符覆盖和水平度量变化时终止。"""
    if __version__ != "4.60.1":
        raise ValueError("请使用 fonttools==4.60.1 以复现已验证的字库")
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("字体源 SHA-256 不匹配，请核对 public/fonts/SOURCE.md")
    font = TTFont(source, recalcTimestamp=False)
    cmap = font.getBestCmap()
    original_metrics = {code: font["hmtx"][glyph] for code, glyph in cmap.items()}
    options = subset.Options()
    options.hinting = False
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    # 由字体自身字符全集决定保留范围，不能按题库或任何用户填写内容裁字。
    subsetter.populate(unicodes=cmap)
    subsetter.subset(font)
    assert font.getBestCmap().keys() == cmap.keys(), "字符覆盖发生变化"
    assert {code: font["hmtx"][glyph] for code, glyph in font.getBestCmap().items()} == original_metrics
    # 衍生字体使用独立名称；保留原版权与 OFL 许可记录。
    names = {1: "WebTable Sans SC", 2: "Regular", 3: "WebTableSansSC-Regular-20261017",
             4: "WebTable Sans SC Regular", 6: "WebTableSansSC-Regular",
             16: "WebTable Sans SC", 17: "Regular"}
    for name_id, value in names.items():
        for platform, encoding, language in [(3, 1, 0x409), (1, 0, 0)]:
            font["name"].setName(value, name_id, platform, encoding, language)
    cff = font["CFF "].cff
    cff.fontNames = ["WebTableSansSC-Regular"]
    cff.topDictIndex[0].FamilyName = "WebTable Sans SC"
    cff.topDictIndex[0].FullName = "WebTable Sans SC Regular"
    destination.mkdir(parents=True, exist_ok=True)
    from io import BytesIO
    output = BytesIO()
    font.save(output)
    data = output.getvalue()
    digest = hashlib.sha256(data).hexdigest()
    target = destination / f"WebTableSansSC-Regular-{digest[:12]}.otf"
    target.write_bytes(data)
    print(f"file={target.name}\nbytes={len(data)}\nsha256={digest}\ncharacters={len(cmap)}")
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    prepare(args.source, args.destination)
