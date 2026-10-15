#!/usr/bin/env python3
"""
crawl-expert-games.py
---------------------
Thu thập ván cờ có bình luận/chú giải chuyên gia từ diễn đàn Thăng Long Kỳ Đạo.
Nguồn: chuyên mục "Bình luận các ván đấu hay" (https://thanglongkydao.com/forums/binh-luan-cac-van-dau-hay.137/)
Trích xuất định dạng DhtmlXQ chuẩn (DhtmlXQ_movelist, DhtmlXQ_commentN, DhtmlXQ_title...).
Lưu kết quả vào .data/expert-commentary/.

Sử dụng: python3 scripts/crawl-expert-games.py [--limit 25] [--pages 3]
"""

import argparse
import hashlib
import html as html_lib
import json
import os
import re
import time
import urllib.request
from pathlib import Path
from typing import Optional

BASE_URL = "https://thanglongkydao.com"
FORUM_URL = f"{BASE_URL}/forums/binh-luan-cac-van-dau-hay.137/"
OUTPUT_DIR = Path(__file__).parent.parent / ".data" / "expert-commentary"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def clean_text(text: str) -> str:
    """Làm sạch văn bản chú giải: thay || thành xuống dòng, giải mã ký tự unicode / html."""
    t = text.replace("||||", "\n\n").replace("||", "\n")
    t = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), t)
    t = html_lib.unescape(t)
    return t.strip()


def parse_dhtmlxq(block: str) -> Optional[dict]:
    """Phân tích một khối [DhtmlXQ]...[/DhtmlXQ] thành đối tượng dữ liệu hoàn chỉnh."""
    tags = {}
    for match in re.finditer(r"\[(DhtmlXQ_[a-zA-Z0-9]+)\](.*?)\[/\1\]", block, re.DOTALL):
        tags[match.group(1)] = match.group(2).strip()

    movelist_raw = tags.get("DhtmlXQ_movelist", "")
    if len(movelist_raw) < 16 or len(movelist_raw) % 4 != 0:
        return None

    # Bỏ qua các ván cờ thế / tàn cuộc có thế cờ ban đầu tùy biến (DhtmlXQ_binit)
    if tags.get("DhtmlXQ_binit"):
        return None

    # Tách danh sách nước đi dạng tọa độ DhtmlXQ (4 số: c1, r1, c2, r2)
    # Tọa độ: col 0..8, row 0..9 (tính từ góc trên bên trái)
    moves_coords = []
    for i in range(0, len(movelist_raw), 4):
        chunk = movelist_raw[i : i + 4]
        try:
            c1, r1, c2, r2 = int(chunk[0]), int(chunk[1]), int(chunk[2]), int(chunk[3])
            from_sq = r1 * 9 + c1
            to_sq = r2 * 9 + c2
            moves_coords.append({"from": from_sq, "to": to_sq, "raw": chunk})
        except ValueError:
            return None

    # Bóc tách tất cả các lời bình luận theo nửa nước (ply)
    comments = {}
    for k, v in tags.items():
        m = re.match(r"^DhtmlXQ_comment(\d+)$", k)
        if m:
            ply = int(m.group(1))
            cleaned = clean_text(v)
            if len(cleaned) > 5:
                comments[ply] = cleaned

    # Chỉ giữ các ván có ít nhất 2 lời bình chi tiết
    if len(comments) < 2:
        return None

    title = clean_text(tags.get("DhtmlXQ_title", "Ván cờ bình luận"))
    red = clean_text(tags.get("DhtmlXQ_red", tags.get("DhtmlXQ_redname", "Bên Đỏ")))
    black = clean_text(tags.get("DhtmlXQ_black", tags.get("DhtmlXQ_blackname", "Bên Đen")))
    event = clean_text(tags.get("DhtmlXQ_event", tags.get("DhtmlXQ_class", "")))
    date = clean_text(tags.get("DhtmlXQ_date", ""))
    result = clean_text(tags.get("DhtmlXQ_result", ""))
    opening = clean_text(tags.get("DhtmlXQ_open", ""))

    game_id_hash = hashlib.md5(f"{title}_{red}_{black}_{len(moves_coords)}".encode("utf-8")).hexdigest()[:10]

    return {
        "id": f"tlkd_{game_id_hash}",
        "title": title,
        "red": red,
        "black": black,
        "event": event,
        "date": date,
        "result": result,
        "opening": opening,
        "totalPlies": len(moves_coords),
        "movesCoords": moves_coords,
        "comments": comments,
        "commentCount": len(comments),
    }


def fetch_url(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode("utf-8", errors="replace")


def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl expert games from Thang Long Ky Dao")
    parser.add_argument("--limit", type=int, default=25, help="Max games to save (default 25)")
    parser.add_argument("--pages", type=int, default=3, help="Max forum pages to scan (default 3)")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Bắt đầu crawl ván cờ có bình luận từ {FORUM_URL} (mục tiêu: {args.limit} ván)")
    print("=" * 65)

    saved_count = 0
    seen_ids = set()

    for p in range(1, args.pages + 1):
        if saved_count >= args.limit:
            break

        page_url = FORUM_URL if p == 1 else f"{FORUM_URL}page-{p}"
        print(f"\n[Trang {p}/{args.pages}] Đang quét danh sách chủ đề: {page_url}")

        try:
            html = fetch_url(page_url)
        except Exception as e:
            print(f"  Lỗi tải trang danh mục {page_url}: {e}")
            continue

        thread_links = []
        for tag_m in re.finditer(r'<a\s+([^>]*data-tp-primary="on"[^>]*)>', html, re.IGNORECASE):
            href_m = re.search(r'href="(/threads/[^"]+)"', tag_m.group(1))
            if href_m:
                thread_links.append(href_m.group(1))
        print(f"  Tìm thấy {len(thread_links)} chủ đề.")

        for t_link in thread_links:
            if saved_count >= args.limit:
                break

            t_url = f"{BASE_URL}{t_link}"
            time.sleep(1.2)  # Giãn cách lịch sự

            try:
                t_html = fetch_url(t_url)
            except Exception as e:
                print(f"    Lỗi tải chủ đề {t_link}: {e}")
                continue

            # Trích xuất các khối [DhtmlXQ]...[/DhtmlXQ]
            blocks = re.findall(r"\[DhtmlXQ\].*?\[/DhtmlXQ\]", t_html, re.DOTALL)
            if not blocks:
                continue

            for block in blocks:
                if saved_count >= args.limit:
                    break

                game_data = parse_dhtmlxq(block)
                if not game_data:
                    continue

                gid = game_data["id"]
                if gid in seen_ids:
                    continue
                seen_ids.add(gid)

                out_path = OUTPUT_DIR / f"{gid}.json"
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(game_data, f, ensure_ascii=False, indent=2)

                saved_count += 1
                print(
                    f"  ✓ [{saved_count}/{args.limit}] {game_data['title']} "
                    f"({game_data['red']} vs {game_data['black']}) "
                    f"- {game_data['totalPlies']} nửa nước, {game_data['commentCount']} lời bình"
                )

    print("\n" + "=" * 65)
    print(f"HOÀN THÀNH: Đã thu thập {saved_count} ván có lời bình chuyên gia.")
    print(f"Thư mục lưu trữ: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
