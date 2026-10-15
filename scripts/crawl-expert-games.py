#!/usr/bin/env python3
"""
crawl-expert-games.py
---------------------
Thu thập ván cờ có bình luận/chú giải chuyên gia từ diễn đàn Thăng Long Kỳ Đạo.
Nguồn chính:
  1. "Khai cuộc" (forums/khai-cuoc.7/)
  2. "Danh thủ đại chiến" (forums/danh-thu-dai-chien.423/)
  3. "Trung cuộc" (forums/trung-cuoc.8/)
  4. "Bình luận các ván đấu hay" (forums/binh-luan-cac-van-dau-hay.137/)
  5. "Danh thủ VN & thế giới" (forums/cac-danh-thu-viet-nam-va-the-gioi.157/)

Sử dụng:
  python3 scripts/crawl-expert-games.py [--limit 100] [--delay 1.0]
"""

import argparse
import hashlib
import html as html_lib
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Set

BASE_URL = "https://thanglongkydao.com"
PRIMARY_FORUMS = [
    {"url": f"{BASE_URL}/forums/khai-cuoc.7/", "name": "Khai cuộc", "max_pages": 15},
    {"url": f"{BASE_URL}/forums/danh-thu-dai-chien.423/", "name": "Danh thủ đại chiến", "max_pages": 15},
    {"url": f"{BASE_URL}/forums/trung-cuoc.8/", "name": "Trung cuộc", "max_pages": 15},
    {"url": f"{BASE_URL}/forums/binh-luan-cac-van-dau-hay.137/", "name": "Bình luận các ván đấu hay", "max_pages": 7},
    {"url": f"{BASE_URL}/forums/cac-danh-thu-viet-nam-va-the-gioi.157/", "name": "Danh thủ VN & thế giới", "max_pages": 10},
]
OUTPUT_DIR = Path(__file__).parent.parent / ".data" / "expert-commentary"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

# Thế cờ khai cuộc tiêu chuẩn 32 quân trong định dạng DhtmlXQ
STANDARD_BINIT = "8979695949392919097717866646260600102030405060708012720323436383"


def clean_text(text: str) -> str:
    """Làm sạch văn bản chú giải: thay || thành xuống dòng, gỡ bỏ HTML/BBCode, giải mã ký tự unicode / html."""
    t = text.replace("||||", "\n\n").replace("||", "\n")
    t = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), t)
    t = html_lib.unescape(t)
    # Loại bỏ thẻ HTML
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.IGNORECASE)
    t = re.sub(r"<[^>]+>", " ", t)
    # Loại bỏ thẻ BBCode như [b], [/b], [color=...]
    t = re.sub(r"\[/?[a-zA-Z0-9_]+(?:=[^\]]*)?\]", "", t)
    # Thu gọn khoảng trắng thừa
    lines = [line.strip() for line in t.split("\n")]
    return "\n".join(line for line in lines if line).strip()


def parse_dhtmlxq(block: str) -> Optional[dict]:
    """Phân tích một khối [DhtmlXQ]...[/DhtmlXQ] thành đối tượng dữ liệu hoàn chỉnh."""
    tags: Dict[str, str] = {}
    for match in re.finditer(r"\[(DhtmlXQ_[a-zA-Z0-9]+)\](.*?)\[/\1\]", block, re.DOTALL | re.IGNORECASE):
        # Chuẩn hóa key về dạng chữ thường để tra cứu không phân biệt hoa thường
        tags[match.group(1).lower()] = match.group(2).strip()

    movelist_raw = tags.get("dhtmlxq_movelist", "")
    if len(movelist_raw) < 16 or len(movelist_raw) % 4 != 0:
        return None

    # Bỏ qua các ván cờ thế / tàn cuộc có thế cờ ban đầu tùy biến (khác với chuẩn 32 quân)
    binit = tags.get("dhtmlxq_binit", "").strip()
    if binit and binit != STANDARD_BINIT:
        return None

    # Tách danh sách nước đi dạng tọa độ DhtmlXQ (4 số: c1, r1, c2, r2)
    moves_coords = []
    for i in range(0, len(movelist_raw), 4):
        chunk = movelist_raw[i : i + 4]
        try:
            c1, r1, c2, r2 = int(chunk[0]), int(chunk[1]), int(chunk[2]), int(chunk[3])
            if not (0 <= c1 <= 8 and 0 <= c2 <= 8 and 0 <= r1 <= 9 and 0 <= r2 <= 9):
                return None
            if c1 == c2 and r1 == r2:
                return None
            from_sq = r1 * 9 + c1
            to_sq = r2 * 9 + c2
            moves_coords.append({"from": from_sq, "to": to_sq, "raw": chunk})
        except ValueError:
            return None

    # Bóc tách tất cả các lời bình luận theo nửa nước (ply)
    comments = {}
    for k, v in tags.items():
        m = re.match(r"^dhtmlxq_comment(\d+)$", k)
        if m:
            ply = int(m.group(1))
            cleaned = clean_text(v)
            if len(cleaned) > 5:
                comments[ply] = cleaned

    # Chỉ giữ các ván có ít nhất 2 lời bình chi tiết
    if len(comments) < 2:
        return None

    title = clean_text(tags.get("dhtmlxq_title", "Ván cờ bình luận"))
    red = clean_text(tags.get("dhtmlxq_red", tags.get("dhtmlxq_redname", "Bên Đỏ")))
    black = clean_text(tags.get("dhtmlxq_black", tags.get("dhtmlxq_blackname", "Bên Đen")))
    event = clean_text(tags.get("dhtmlxq_event", tags.get("dhtmlxq_class", "")))
    date = clean_text(tags.get("dhtmlxq_date", ""))
    result = clean_text(tags.get("dhtmlxq_result", ""))
    opening = clean_text(tags.get("dhtmlxq_open", ""))

    # Băm duy nhất dựa trên movelist và tên hai bên
    game_hash = hashlib.md5(f"{movelist_raw}_{red}_{black}".encode("utf-8")).hexdigest()[:10]

    return {
        "id": f"tlkd_{game_hash}",
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
        "movelistRaw": movelist_raw,
    }


def fetch_url(url: str) -> Optional[str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        sys.stderr.write(f"[WARN] Không tải được {url}: {e}\n")
        return None


def extract_thread_links(html: str) -> List[str]:
    """Trích xuất tất cả liên kết chủ đề từ HTML trang danh mục diễn đàn XenForo."""
    links = []
    seen = set()
    for tag_m in re.finditer(r'<a\s+([^>]*data-tp-primary="on"[^>]*)>', html, re.IGNORECASE):
        href_m = re.search(r'href="(/threads/[^"]+)"', tag_m.group(1))
        if href_m:
            href = href_m.group(1)
            clean_href = href.split("?")[0].rstrip("/") + "/"
            if clean_href not in seen:
                seen.add(clean_href)
                links.append(clean_href)
    return links


def extract_thread_pages(html: str, thread_base: str) -> List[str]:
    """Tìm các trang phụ trong cùng một chủ đề (page-2, page-3...)."""
    pages = []
    clean_base = thread_base.rstrip("/")
    pattern = rf'href="({re.escape(clean_base)}/page-(\d+))"'
    for m in re.finditer(pattern, html):
        page_url = m.group(1)
        page_num = int(m.group(2))
        if page_num <= 8 and page_url not in pages:
            pages.append(page_url)
    return sorted(pages, key=lambda x: int(re.search(r'page-(\d+)', x).group(1)))


def strip_quotes(html: str) -> str:
    """Loại bỏ các khối trích dẫn (quote) để tránh trùng ván do thành viên quote lại bài trước."""
    cleaned = re.sub(r'<blockquote\s+class="message-quote".*?</blockquote>', '', html, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'<div\s+class="bbCodeBlock\s+bbCodeBlock--quote".*?</div>\s*</div>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'\[quote.*?\].*?\[/quote\]', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
    return cleaned


def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl expert games from Thang Long Ky Dao")
    parser.add_argument("--limit", type=int, default=100, help="Max games to save (default 100)")
    parser.add_argument("--delay", type=float, default=1.0, help="Polite delay between requests in seconds (default 1.0)")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Đọc danh sách các ván cờ đã tải sẵn trong thư mục
    seen_ids: Set[str] = set()
    seen_movelists: Set[str] = set()
    existing_count = 0

    for existing_file in OUTPUT_DIR.glob("tlkd_*.json"):
        try:
            with open(existing_file, "r", encoding="utf-8") as f:
                d = json.load(f)
                seen_ids.add(d.get("id", existing_file.stem))
                if "movesCoords" in d:
                    m_raw = "".join(m.get("raw", "") for m in d["movesCoords"])
                    if m_raw:
                        seen_movelists.add(m_raw)
                existing_count += 1
        except Exception:
            pass

    print(f"=================================================================", flush=True)
    print(f"BẮT ĐẦU CRAWL VÁN CỜ BÌNH LUẬN ĐẠI SƯ (MỤC TIÊU: {args.limit} VÁN)", flush=True)
    print(f"Đã có sẵn trên đĩa: {existing_count} ván", flush=True)
    print(f"Thư mục lưu trữ: {OUTPUT_DIR}", flush=True)
    print(f"=================================================================\n", flush=True)

    saved_count = existing_count
    visited_thread_urls: Set[str] = set()

    for forum in PRIMARY_FORUMS:
        if saved_count >= args.limit:
            break

        f_url = forum["url"]
        f_name = forum["name"]
        max_p = forum["max_pages"]

        print(f"\n>>> ĐANG QUÉT CHUYÊN MỤC: {f_name} ({f_url})", flush=True)

        for p in range(1, max_p + 1):
            if saved_count >= args.limit:
                break

            page_url = f_url if p == 1 else f"{f_url}page-{p}"
            print(f"  [Trang {p}/{max_p}] Tải danh sách: {page_url}", flush=True)

            html = fetch_url(page_url)
            if not html:
                print(f"    Lỗi tải danh mục: {page_url}", flush=True)
                continue

            thread_links = extract_thread_links(html)
            print(f"    Tìm thấy {len(thread_links)} chủ đề trên trang {p}.", flush=True)

            for t_link in thread_links:
                if saved_count >= args.limit:
                    break

                t_url = f"{BASE_URL}{t_link}"
                if t_url in visited_thread_urls:
                    continue
                visited_thread_urls.add(t_url)

                time.sleep(args.delay)
                t_html = fetch_url(t_url)
                if not t_html:
                    continue

                # Xác định các trang con trong thread (nếu có)
                subpages = [t_url] + [f"{BASE_URL}{sp}" for sp in extract_thread_pages(t_html, t_link)]

                for page_idx, page_to_fetch in enumerate(subpages):
                    if saved_count >= args.limit:
                        break

                    current_page_html = t_html if page_idx == 0 else fetch_url(page_to_fetch)
                    if not current_page_html:
                        continue
                    if page_idx > 0:
                        time.sleep(args.delay)

                    # Gỡ bỏ blockquote trích dẫn để tránh trùng lặp
                    cleaned_html = strip_quotes(current_page_html)

                    # Tìm tất cả khối DhtmlXQ
                    blocks = re.findall(r"\[DhtmlXQ\].*?\[/DhtmlXQ\]", cleaned_html, re.DOTALL | re.IGNORECASE)
                    if not blocks:
                        continue

                    for block in blocks:
                        if saved_count >= args.limit:
                            break

                        game_data = parse_dhtmlxq(block)
                        if not game_data:
                            continue

                        gid = game_data["id"]
                        m_raw = game_data["movelistRaw"]

                        if gid in seen_ids or m_raw in seen_movelists:
                            continue

                        seen_ids.add(gid)
                        seen_movelists.add(m_raw)

                        # Lưu ra file JSON
                        out_path = OUTPUT_DIR / f"{gid}.json"
                        save_obj = {k: v for k, v in game_data.items() if k != "movelistRaw"}
                        with open(out_path, "w", encoding="utf-8") as f:
                            json.dump(save_obj, f, ensure_ascii=False, indent=2)

                        saved_count += 1
                        print(
                            f"  ✓ [{saved_count}/{args.limit}] {game_data['title']} "
                            f"({game_data['red']} vs {game_data['black']}) "
                            f"- {game_data['totalPlies']} nửa nước, {game_data['commentCount']} lời bình",
                            flush=True,
                        )

    print("\n" + "=" * 65, flush=True)
    print(f"CRAWL HOÀN TẤT: Hiện có {saved_count} ván có lời bình chuyên gia.", flush=True)
    print(f"Thư mục: {OUTPUT_DIR}", flush=True)
    print("=" * 65, flush=True)


if __name__ == "__main__":
    main()
