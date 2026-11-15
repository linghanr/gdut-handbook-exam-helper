#!/usr/bin/env python
"""把 PDF 逐页抽取为带页码锚点的纯文本，便于全文检索与回查出处。

用法: python src/extract_pdf.py <pdf路径> [输出txt路径]
依赖: pip install pymupdf
"""
import os
import sys

try:
    import pymupdf
except ImportError:  # 兼容旧包名
    import fitz as pymupdf

SEP = "\n\n===== [PAGE %d] =====\n\n"


def extract(pdf_path: str, out_path: str) -> None:
    """抽取 PDF 全文，按页写入输出文件。"""
    doc = pymupdf.open(pdf_path)
    parts = []
    total_chars = 0
    for index, page in enumerate(doc, start=1):
        text = page.get_text("text")
        total_chars += len(text.strip())
        parts.append(SEP % index + text)
    doc.close()
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("".join(parts))
    print(f"{pdf_path} -> {out_path}  pages={len(parts)}  chars={total_chars}")


def main() -> None:
    """命令行入口：参数不足时给出用法说明。"""
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    pdf_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(pdf_path)[0] + ".txt"
    extract(pdf_path, out_path)


if __name__ == "__main__":
    main()
