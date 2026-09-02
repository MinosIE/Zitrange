#!/usr/bin/env python3
"""字体检视：读取字体元信息与支持的码位集合。

注意文件名不能是 inspect.py，否则会遮挡 Python 标准库 inspect 模块。

契约（JSON over stdin/stdout）：
  输入: {"path": "/abs/font.ttf", "fontNumber": 0}
  输出: {
    "family", "subfamily", "weight", "style", "numGlyphs",
    "outline": "glyf" | "cff", "isVariable": bool,
    "codepoints": [int, ...]   # 字体实际支持的码位（升序）
  }
错误: 向 stderr 打印，退出码 1。
"""
import json
import sys

from fontTools.ttLib import TTFont


def inspect(path: str, font_number: int = 0) -> dict:
    f = TTFont(path, fontNumber=font_number, lazy=True)

    name = f["name"]

    def g(name_id: int) -> str:
        try:
            return name.getDebugName(name_id) or ""
        except Exception:
            return ""

    # 字重：优先 OS/2 usWeightClass
    weight = 400
    if "OS/2" in f:
        try:
            weight = int(f["OS/2"].usWeightClass) or 400
        except Exception:
            pass

    subfamily = g(2)
    style = "italic" if "italic" in subfamily.lower() else "normal"

    # 轮廓类型：CFF/CFF2 -> cff，否则 glyf
    outline = "cff" if ("CFF " in f or "CFF2" in f) else "glyf"

    cmap = set()
    for t in f["cmap"].tables:
        cmap.update(t.cmap.keys())

    codepoints = sorted(cp for cp in cmap if 0x20 <= cp <= 0x10FFFF)

    f.close()
    return {
        "family": g(1),
        "subfamily": subfamily,
        "weight": weight,
        "style": style,
        "numGlyphs": f["maxp"].numGlyphs,
        "outline": outline,
        "isVariable": "fvar" in f,
        "codepoints": codepoints,
    }


def main() -> int:
    try:
        req = json.load(sys.stdin)
        path = req["path"]
        font_number = int(req.get("fontNumber", 0))
        result = inspect(path, font_number)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as e:  # noqa: BLE001
        print(f"inspect error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
