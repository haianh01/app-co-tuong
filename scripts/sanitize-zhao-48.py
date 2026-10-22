#!/usr/bin/env python3
"""
sanitize-zhao-48.py
-------------------
Đưa .data/expert-commentary/zhao48_*.json về trạng thái "chỉ có phụ đề gốc".

Lý do: enrich-zhao-48-summaries.py và attach-zhao-boards.py đã ghi đè các trường
siêu dữ liệu (kỳ thủ, giải, năm, kết quả, corePrinciple, evidenceQuote) và thế cờ/lời bình
theo nước bằng giá trị gõ tay KHÔNG có trong phụ đề (đối chiếu: 2/48 evidenceQuote khớp phụ đề,
22/48 cặp kỳ thủ được nhắc tới). Dữ liệu như vậy không được dùng làm chuẩn đo.

Sau khi chạy:
- `transcript`: các đoạn phụ đề gốc (có mốc [mm:ss]) — nguồn duy nhất được tin.
- Siêu dữ liệu, thế cờ, lời bình theo nước, tóm tắt: null/rỗng cho tới khi điền lại có dẫn chứng.
- `comments` rỗng ⇒ compare-expert-commentary.ts bỏ qua bài này (không còn đo trên dữ liệu bịa).

Bản sao lưu nguyên trạng được ghi vào .data/expert-commentary.bak-<ngày>/ trước khi sửa.

Kiểm tra dẫn chứng (`--check`): mọi `summary.evidenceQuote` phải là chuỗi con của phụ đề
(sau khi chuẩn hóa khoảng trắng/dấu câu); `red`/`black` phải xuất hiện trong phụ đề
hoặc có `provenance.sources`; không hai bài chung một biên bản; `status: verified` cần ≥2 cặp nước
liên tiếp trong phụ đề khớp biên bản (`provenance.moveEvidence`, do populate-real-games.ts ghi). Vi phạm ⇒ thoát mã 1.
"""

import argparse
import datetime
import json
import re
import shutil
import sys
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / ".data" / "expert-commentary"
TIMESTAMP_RE = re.compile(r"^\[\d{1,2}:\d{2}(?::\d{2})?\]")


def norm(s: str) -> str:
    return re.sub(r"\W+", " ", s.lower()).strip()


def extract_transcript(d: dict) -> dict:
    """Lấy phụ đề gốc: ưu tiên videoComments (bản attach đã dời sang), sau đó các đoạn có mốc thời gian trong comments."""
    if isinstance(d.get("transcript"), dict) and d["transcript"]:
        return d["transcript"]
    if isinstance(d.get("videoComments"), dict) and d["videoComments"]:
        src = d["videoComments"]
    else:
        src = d.get("comments") or {}
    chunks = [v for _, v in sorted(src.items(), key=lambda kv: int(kv[0])) if TIMESTAMP_RE.match(v.strip())]
    return {str(i): c for i, c in enumerate(chunks)}


def sanitize(d: dict) -> dict:
    transcript = extract_transcript(d)
    return {
        "id": d["id"],
        "title": d.get("title"),
        "videoId": d.get("videoId"),
        "videoUrl": d.get("videoUrl"),
        "transcript": transcript,
        "red": None,
        "black": None,
        "event": None,
        "date": None,
        "result": None,
        "opening": None,
        "initialFen": None,
        "totalPlies": 0,
        "movesCoords": [],
        "comments": {},
        "commentCount": 0,
        "summary": None,
        "provenance": {
            "status": "transcript-only",
            "sanitizedAt": datetime.date.today().isoformat(),
            "sources": [],
        },
    }


def check(d: dict) -> list:
    errors = []
    text = norm(" ".join((d.get("transcript") or {}).values()))
    sources = (d.get("provenance") or {}).get("sources") or []
    summary = d.get("summary") or {}
    quote = summary.get("evidenceQuote") if isinstance(summary, dict) else None
    if quote and norm(quote) not in text:
        errors.append("evidenceQuote không có trong phụ đề")
    for side in ("red", "black"):
        name = d.get(side)
        if name and norm(name) not in text and not sources:
            errors.append(f"{side}='{name}' không có trong phụ đề và không có provenance.sources")
    if d.get("movesCoords") and not sources:
        errors.append("có movesCoords nhưng không có provenance.sources (biên bản ván lấy từ đâu?)")
    status = (d.get("provenance") or {}).get("status")
    if status == "verified" and len((d.get("provenance") or {}).get("moveEvidence") or []) < 2:
        errors.append("status=verified nhưng moveEvidence < 2 cặp nước khớp phụ đề")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="chỉ kiểm tra dẫn chứng, không sửa file")
    args = ap.parse_args()

    files = sorted(DATA_DIR.glob("zhao48_*.json"))
    if not files:
        print(f"Không thấy file zhao48_*.json trong {DATA_DIR}", file=sys.stderr)
        return 1

    if args.check:
        bad = 0
        games = {}
        for f in files:
            d = json.loads(f.read_text(encoding="utf-8"))
            errs = check(d)
            key = "".join(m.get("raw", "") for m in d.get("movesCoords") or [])
            if key:
                if key in games:
                    errs.append(f"dùng cùng biên bản với {games[key]}")
                games.setdefault(key, f.name)
            if errs:
                bad += 1
                print(f"[✗] {f.name}: " + "; ".join(errs))
        print(f"{len(files) - bad}/{len(files)} bài đạt kiểm tra dẫn chứng")
        return 1 if bad else 0

    backup = DATA_DIR.parent / f"expert-commentary.bak-{datetime.date.today().isoformat()}"
    if backup.exists():
        print(f"Bản sao lưu {backup} đã tồn tại — dừng để không ghi đè.", file=sys.stderr)
        return 1
    backup.mkdir()
    for f in files:
        shutil.copy2(f, backup / f.name)
    print(f"[i] Đã sao lưu {len(files)} file vào {backup}")

    empty = []
    for f in files:
        out = sanitize(json.loads(f.read_text(encoding="utf-8")))
        if not out["transcript"]:
            empty.append(f.name)
        f.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[✓] Đã làm sạch {len(files)} file")
    if empty:
        print(f"[!] {len(empty)} file không tìm thấy phụ đề gốc: {', '.join(empty)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
