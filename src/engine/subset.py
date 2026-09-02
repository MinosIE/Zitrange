#!/usr/bin/env python3
"""字体分片子集化：把一份字体按多组分片码位，输出 woff2/woff/ttf 文件。

采用两阶段子集化（PRD §7.4）以大幅缩短大字体耗时：
  阶段1：对源字体按「全部所需码位的并集」做一次子集化，得到中间字体；
  阶段2：对每个分片，从中间字体再子集化到该片码位并转格式。
这样 17MB 书法体只需解析 1 次，而非每片解析 1 次（实测可快 10 倍）。

契约（JSON over stdin/stdout）：
  输入: {
    "path": "/abs/font.ttf",
    "fontNumber": 0,
    "chunks": [[cp, cp, ...], ...],
    "formats": ["woff2"],          # 允许 "woff2" | "woff" | "ttf"
    "outDir": "/abs/out",
    "baseName": "myfont"
  }
  输出: {
    "chunks": [
      {"index": 0, "unicodes": N,
       "files": {"woff2": {"path": "...", "bytes": N}}}
    ]
  }
错误: 向 stderr 打印，退出码 1。
"""
import json
import os
import sys
import tempfile

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

FLAVOR_EXT = {"woff2": "woff2", "woff": "woff", "ttf": "ttf"}


def _subset_to_font(font: TTFont, unicodes: list[int]) -> None:
    options = Options()
    options.name_IDs = ["*"]  # 保留 family 等名称，供 @font-face 使用
    options.notdef_outline = True
    options.recalc_timestamp = False
    options.obfuscate = False
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)


def subset(path, font_number, chunks, formats, out_dir, base_name) -> dict:
    os.makedirs(out_dir, exist_ok=True)

    # 阶段1：并集子集化得到中间字体
    src = TTFont(path, fontNumber=font_number, lazy=False)
    union = sorted({cp for chunk in chunks for cp in chunk})
    _subset_to_font(src, union)

    mid_fd, mid_path = tempfile.mkstemp(suffix=".ttf", dir=out_dir)
    os.close(mid_fd)
    src.save(mid_path)
    src.close()

    results = []
    try:
        for i, cps in enumerate(chunks):
            out_files = {}
            # 阶段2：从中间字体逐片子集化
            mid = TTFont(mid_path)
            if cps:
                _subset_to_font(mid, cps)
            for fmt in formats:
                ext = FLAVOR_EXT[fmt]
                out_path = os.path.join(out_dir, f"{base_name}-{i}.{ext}")
                flavor = None if fmt == "ttf" else fmt
                if flavor:
                    mid.flavor = flavor
                else:
                    mid.flavor = None
                mid.save(out_path)
                out_files[fmt] = {
                    "path": out_path,
                    "bytes": os.path.getsize(out_path),
                }
            mid.close()
            results.append(
                {"index": i, "unicodes": len(cps), "files": out_files}
            )
    finally:
        if os.path.exists(mid_path):
            os.remove(mid_path)

    return {"chunks": results}


def main() -> int:
    try:
        req = json.load(sys.stdin)
        result = subset(
            req["path"],
            int(req.get("fontNumber", 0)),
            req["chunks"],
            req.get("formats", ["woff2"]),
            req["outDir"],
            req["baseName"],
        )
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as e:  # noqa: BLE001
        print(f"subset error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
