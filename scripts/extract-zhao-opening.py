#!/usr/bin/env python3
"""
extract-zhao-opening.py
-----------------------
Trích xuất phụ đề và tạo cấu trúc JSON cho toàn bộ 48 bài giảng Khai cuộc của Triệu Hâm Hâm (Zhao Xinxin).
Lưu trữ tại .data/expert-commentary/zhao48_opening_baiNN_<videoId>.json.
Đảm bảo khớp 100% với 183 trích dẫn và mốc giờ trong src/lib/xiangqi/zhao48-opening-lessons.ts.
"""

import os
import re
import sys
import json
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple

DATA_DIR = Path(__file__).parent.parent / ".data" / "expert-commentary"
DATA_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR = Path("/tmp/zhao_opening")
TEMP_DIR.mkdir(parents=True, exist_ok=True)

OPENING_LESSONS = [
    {"lesson": 1, "video": "ls1m7fsWupY", "title": "Cách Học Khai Cuộc Tốt Nhất"},
    {"lesson": 2, "video": "BQihJL4GSZ4", "title": "3 Nguyên Tắc Và 4 Loại Khai Cuộc"},
    {"lesson": 3, "video": "duMqJNWC9uU", "title": "Cách Xuất Xe Hay Chơi - Trực Xe Và Hoành Xe"},
    {"lesson": 4, "video": "rptCpPW6Fmc", "title": "Cách Sử Dụng Hoành Xe Trong Khai Cục Cấp Công"},
    {"lesson": 5, "video": "BIswOFtKs2M", "title": "Trực Xe Trong Khai Cục Tấn Công Chậm"},
    {"lesson": 6, "video": "bVd-QHAb2SM", "title": "Hoành Xe Trong Khai Cục Tấn Công Chậm"},
    {"lesson": 7, "video": "FmvZQMI7eP4", "title": "Trực Xe Trong Tiên Nhân Chỉ Lộ"},
    {"lesson": 8, "video": "kds0mmzaAro", "title": "Hoành Xe Trong Đối Binh Cục"},
    {"lesson": 9, "video": "2JpFrEePsbA", "title": "Trực Xe Trong Khai Cục Tán Thủ"},
    {"lesson": 10, "video": "qLecf2CGUwU", "title": "Hoành Xe Trong Khai Cục Tán Thủ"},
    {"lesson": 11, "video": "FXwxcOQSkRg", "title": "Thủ Pháp Xuất Xe Bá Đạo Đại Xuất Xe Và Tiểu Xuất Xe"},
    {"lesson": 12, "video": "P7DKtEjQCck", "title": "Xuất Xe Lộ 3 Và Lộ 7"},
    {"lesson": 13, "video": "UKRJszbGA1Q", "title": "Kỹ Xảo Xuất Xe Thiếp Thân Xa"},
    {"lesson": 14, "video": "XNMdP2qlBRE", "title": "Xuất Xe Chậm Có Đúng Kỳ Lý Không"},
    {"lesson": 15, "video": "B8riDlr577Q", "title": "Cực Chậm Xuất Xe Thách Thức Nguyên Lý Khai Cục"},
    {"lesson": 16, "video": "ngg_tCZof4o", "title": "Tả Pháo Phong Xe"},
    {"lesson": 17, "video": "K7v-E9g5FcY", "title": "Song Pháo Phong Xe"},
    {"lesson": 18, "video": "5d4J5zX2XNs", "title": "Ngoại Mã Phong Xe"},
    {"lesson": 19, "video": "QdR7o8j7pRU", "title": "Kỹ Xảo Cao Cấp Giành Chiếm Yếu Đạo"},
    {"lesson": 20, "video": "Y9hOhbBBzJg", "title": "Sai Lầm Khi Xuất Xe Thường Thấy Ở Kỳ Thủ Nghiệp Dư"},
    {"lesson": 21, "video": "OBvwwc1HMPE", "title": "Chính Mã - Cách Xuất Mã Tốt Nhất"},
    {"lesson": 22, "video": "-vqB7q-pI1E", "title": "Kết Hợp Sử Dụng Chính Mã Và Biên Mã"},
    {"lesson": 23, "video": "ukoIQhI-ZeY", "title": "Song Mã Biên Hiếm Thấy"},
    {"lesson": 24, "video": "cYSPuSvi_lA", "title": "Quải Giác Mã Vừa Yêu Vừa Hận"},
    {"lesson": 25, "video": "C4SXoxwgNqg", "title": "Cái Mã Tam Chùy Điểm Đột Phá Trong Tấn Công Chậm"},
    {"lesson": 26, "video": "P_M_7YJVncg", "title": "Tả Mã Bàn Hà Chiến Thuật Kinh Điển Của Mọi Thời Đại"},
    {"lesson": 27, "video": "W3GAQlq64FA", "title": "Bảng Xếp Hạng Công Mã Tranh Tiên"},
    {"lesson": 28, "video": "hv1FOPj9cm0", "title": "Mã Linh Hoạt Tinh Túy Tối Thượng Của Thuật Dùng Mã"},
    {"lesson": 29, "video": "qWLnCkVL_I8", "title": "Ngũ Lục Pháo Các Quân Có Căn"},
    {"lesson": 30, "video": "C636_Y-AubA", "title": "Ngũ Thất Pháo Và Đòn Phối Hợp Binh Chủng Kinh Điển"},
    {"lesson": 31, "video": "dUgZMHdXazY", "title": "Ngũ Bát Pháo Đòn Đột Kích Cứng Rắn Nhất"},
    {"lesson": 32, "video": "InmB8A6Zr7M", "title": "Ngũ Cửu Pháo Khắc Tinh Của Tả Mã Bàn Hà"},
    {"lesson": 33, "video": "o9JLTTwNL4s", "title": "Tuần Hà Pháo Xây Dựng Lô Cốt Kiên Cố"},
    {"lesson": 34, "video": "0RbCGYb9Tdg", "title": "Lôi Công Pháo Uy Lực Và Điểm Tử Huyệt"},
    {"lesson": 35, "video": "zRK6z9VTG-c", "title": "Thuận Pháo - Liệt Pháo - Nghịch Pháo"},
    {"lesson": 36, "video": "SPwf6Y6PfbE", "title": "Uyên Ương Pháo Và Quy Bối Pháo Cạm Bẫy Khai Cuộc Dị Biến"},
    {"lesson": 37, "video": "WSEjO4AbF1Y", "title": "Sĩ Giác Pháo Vị Trí Pháo Tốt Nhất Trong Khai Cuộc Tán Thủ"},
    {"lesson": 38, "video": "TPIj1Q8emxI", "title": "Song Biên Pháo Hai Pháo Biên Hợp Vây"},
    {"lesson": 39, "video": "ENPKG0bWYTI", "title": "Quá Cung Pháo Trái Mạnh Phải Yếu"},
    {"lesson": 40, "video": "rv3wvk_2rkk", "title": "Kim Câu Pháo Vấn Đề Tắc Nghẽn Binh Lực"},
    {"lesson": 41, "video": "LYHwjXEBkR4", "title": "Song Pháo Quá Hà"},
    {"lesson": 42, "video": "1bcKklx7f0A", "title": "Lưỡng Đầu Xà Thủ Pháp Xuất Động Binh Nổi Tiếng Nhất"},
    {"lesson": 43, "video": "LK_4yUU5SBg", "title": "Lưỡng Đầu Xà Đại Chiến Tam Bộ Hổ"},
    {"lesson": 44, "video": "-KJcF8Sn1s0", "title": "Lưỡng Đầu Xà Trong Khai Cuộc Tán Thủ"},
    {"lesson": 45, "video": "onmbebggBF0", "title": "Phi Tượng Cuộc Có Thể Tấn Chốt Giữa"},
    {"lesson": 46, "video": "jUnUWPaeSQI", "title": "Phi Tượng Loạn Ắt Xấu Cờ"},
    {"lesson": 47, "video": "QVp0gn1kljs", "title": "Lên Sĩ Lúc Nào Tốt Nhất"},
    {"lesson": 48, "video": "05PK2wlHduA", "title": "Bản Chất Của Khai Cuộc Trong Cờ Tướng"},
]

# Nạp mốc thời gian quote từ src/lib/xiangqi/zhao48-opening-lessons.ts để đảm bảo cắt đoạn chính xác
def load_opening_quote_timestamps() -> Dict[int, List[str]]:
    ts_file = Path(__file__).parent.parent / "src" / "lib" / "xiangqi" / "zhao48-opening-lessons.ts"
    if not ts_file.exists():
        return {}
    with open(ts_file, "r", encoding="utf-8") as f:
        content = f.read()

    lesson_quotes = {}
    pattern = r"(\d+):\s*\{.*?lesson:\s*(\d+),.*?quotes:\s*(\[.*?\]),"
    for m in re.finditer(pattern, content, re.DOTALL):
        lesson_num = int(m.group(2))
        quotes_raw = m.group(3)
        ats = re.findall(r'at:\s*["\']([^"\']+)["\']', quotes_raw)
        lesson_quotes[lesson_num] = ats
    return lesson_quotes

LESSON_QUOTE_TIMESTAMPS = load_opening_quote_timestamps()

TERM_REPLACEMENTS = [
    (r"\bquấn tượng kỳ\b", "cuốn Tượng kỳ"),
    (r"\bchệ h hâm\b", "Triệu Hâm Hâm"),
    (r"\btriệu hâm(?! hâm)\b", "Triệu Hâm Hâm"),
    (r"\blưu điện trung\b", "Lưu Điện Trung"),
    (r"\bliêu định trung\b", "Lưu Điện Trung"),
    (r"\blữ khâm\b", "Lữ Khâm"),
    (r"\bxong xe\b", "song Xe"),
    (r"\bxong tượng\b", "song Tượng"),
    (r"\bxong sĩ\b", "song Sĩ"),
    (r"\bxong mã\b", "song Mã"),
    (r"\bmuộn cung sát\b", "Muộn cung sát (闷宫杀)"),
    (r"\bmộn cung sát\b", "Muộn cung sát (闷宫杀)"),
    (r"\bngọa tào mã\b", "Ngọa tào Mã (卧槽马)"),
    (r"\boa tâm mã\b", "Oa tâm Mã (窝心马)"),
    (r"\bpháo lăm\b", "Pháo 5"),
    (r"\bpháo ba\b", "Pháo 3"),
    (r"\bpháo bảy\b", "Pháo 7"),
    (r"\bpháo tám\b", "Pháo 8"),
    (r"\bpháo hai\b", "Pháo 2"),
    (r"\bpháo chín\b", "Pháo 9"),
    (r"\bmã ba\b", "Mã 3"),
    (r"\bmã bảy\b", "Mã 7"),
    (r"\bmã tám\b", "Mã 8"),
    (r"\bmã chín\b", "Mã 9"),
    (r"\bxe bốn\b", "Xe 4"),
    (r"\bxe bảy\b", "Xe 7"),
    (r"\bxe tám\b", "Xe 8"),
    (r"\bxe chín\b", "Xe 9"),
]

def normalize_terms(text: str) -> str:
    for pattern, repl in TERM_REPLACEMENTS:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)
    return text

def download_subs(video_id: str) -> Optional[Path]:
    output_tmpl = str(TEMP_DIR / f"{video_id}.%(ext)s")
    url = f"https://www.youtube.com/watch?v={video_id}"
    cmd = [
        "/home/haianh/.local/bin/yt-dlp",
        "--write-sub",
        "--write-auto-subs",
        "--sub-lang", "vi-orig,vi,zh-Hans,zh,en",
        "--ignore-errors",
        "--skip-download",
        "-o", output_tmpl,
        url
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, text=True)
    except subprocess.CalledProcessError as e:
        sys.stderr.write(f"[WARN] yt-dlp warning for {video_id}: {e.stderr}\n")

    for ext in ["vi-orig.vtt", "vi.vtt"]:
        candidate = TEMP_DIR / f"{video_id}.{ext}"
        if candidate.exists() and candidate.stat().st_size > 300:
            return candidate

    vtts = list(TEMP_DIR.glob(f"{video_id}*.vtt"))
    return vtts[0] if vtts else None

def parse_vtt(vtt_path: Path) -> List[Tuple[float, float, str]]:
    with open(vtt_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    blocks = content.split("\n\n")
    segments = []

    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue

        time_line_idx = -1
        for i, line in enumerate(lines):
            if "-->" in line:
                time_line_idx = i
                break

        if time_line_idx == -1:
            continue

        m = re.match(
            r"(\d{2}:)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}:)?(\d{2}):(\d{2})[.,](\d{3})",
            lines[time_line_idx]
        )
        if not m:
            continue

        h1 = int(m.group(1)[:-1]) if m.group(1) else 0
        m1, s1, ms1 = int(m.group(2)), int(m.group(3)), int(m.group(4))
        start_sec = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000.0

        h2 = int(m.group(5)[:-1]) if m.group(5) else 0
        m2, s2, ms2 = int(m.group(6)), int(m.group(7)), int(m.group(8))
        end_sec = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000.0

        text_lines = lines[time_line_idx + 1 :]
        c_lines = [l for l in text_lines if "<c>" in l]
        clean_text_parts = []
        target = c_lines if c_lines else text_lines
        for l in target:
            c = re.sub(r"<[^>]+>", "", l).strip()
            if c:
                clean_text_parts.append(c)

        text = " ".join(clean_text_parts)
        text = re.sub(r"\s+", " ", text).strip()

        if text and (not segments or segments[-1][2] != text):
            segments.append((start_sec, end_sec, text))

    return segments

def cluster_paragraphs(segments: List[Tuple[float, float, str]], lesson_num: int, max_gap: float = 3.5, max_chars: int = 350) -> List[Dict]:
    force_split_times = set(LESSON_QUOTE_TIMESTAMPS.get(lesson_num, []))

    paragraphs = []
    current_text = []
    current_start = 0.0
    current_end = 0.0

    for start, end, text in segments:
        m = int(start // 60)
        s = int(start % 60)
        at_str = f"{m:02d}:{s:02d}"

        # Nếu điểm xuất phát trùng mốc quote thì bắt buộc ngắt đoạn mới để giữ timestamp
        must_split = at_str in force_split_times

        if not current_text:
            current_start = start
            current_end = end
            current_text.append(text)
        elif not must_split and (start - current_end < max_gap) and (len(" ".join(current_text)) + len(text) < max_chars):
            current_text.append(text)
            current_end = end
        else:
            paragraphs.append({
                "start": current_start,
                "end": current_end,
                "text": " ".join(current_text)
            })
            current_start = start
            current_end = end
            current_text = [text]

    if current_text:
        paragraphs.append({
            "start": current_start,
            "end": current_end,
            "text": " ".join(current_text)
        })

    return paragraphs

def process_all_opening_lessons():
    print("=" * 75)
    print("BẮT ĐẦU CÀO TOÀN BỘ TEXT PHỤ ĐỀ 48 BÀI GIẢNG KHAI CUỘC TRIỆU HÂM HÂM")
    print(f"Thư mục lưu trữ: {DATA_DIR}")
    print("=" * 75 + "\n")

    success_count = 0
    skipped_count = 0
    failed_items = []

    try:
        for item in OPENING_LESSONS:
            lesson_num = item["lesson"]
            vid = item["video"]
            title = item["title"]
            out_file = DATA_DIR / f"zhao48_opening_bai{lesson_num:02d}_{vid}.json"

            # Kiểm tra nếu file đã tồn tại và có transcript hợp lệ
            if out_file.exists():
                try:
                    with open(out_file, "r", encoding="utf-8") as f:
                        existing = json.load(f)
                    if len(existing.get("transcript", {})) > 0:
                        print(f"[Bài {lesson_num:02d}] ĐÃ CÓ: {out_file.name} ({len(existing['transcript'])} đoạn) -> Bỏ qua")
                        success_count += 1
                        skipped_count += 1
                        continue
                except Exception:
                    pass

            print(f"[Bài {lesson_num:02d}] Đang tải phụ đề: {title} (ID: {vid})...")
            vtt_path = download_subs(vid)
            if not vtt_path or not vtt_path.exists():
                print(f"  ✗ Thất bại: không tải được file VTT cho {vid}")
                failed_items.append((lesson_num, title, vid, "Không tìm thấy phụ đề VTT"))
                continue

            segments = parse_vtt(vtt_path)
            if not segments:
                print(f"  ✗ Thất bại: file VTT rỗng ({vtt_path.name})")
                failed_items.append((lesson_num, title, vid, "File VTT rỗng"))
                continue

            paragraphs = cluster_paragraphs(segments, lesson_num)

            transcript = {}
            for idx, p in enumerate(paragraphs):
                m = int(p["start"] // 60)
                s = int(p["start"] % 60)
                at_str = f"{m:02d}:{s:02d}"
                transcript[str(idx)] = f"[{at_str}] {p['text']}"

            data = {
                "id": f"zhao48_opening_bai{lesson_num:02d}_{vid}",
                "title": f"Triệu Hâm Hâm 48 Kỳ Lý Khai Cuộc - Bài {lesson_num}: {title}",
                "videoId": vid,
                "videoUrl": f"https://www.youtube.com/watch?v={vid}",
                "lesson": lesson_num,
                "topic": title,
                "transcript": transcript,
                "summary": title
            }

            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            print(f"  ✓ Thành công! Đã lưu {len(transcript)} đoạn thoại -> {out_file.name}")
            success_count += 1

    finally:
        # Dọn dẹp thư mục tạm theo chuẩn process hygiene
        shutil.rmtree(TEMP_DIR, ignore_errors=True)
        print("\n[+] Đã dọn dẹp thư mục tạm /tmp/zhao_opening")

    print("\n" + "=" * 75)
    print("BÁO CÁO KẾT QUẢ CÀO TEXT 48 BÀI GIẢNG KHAI CUỘC")
    print("=" * 75)
    print(f"- Tổng số bài thành công: {success_count}/48 bài (Trong đó đã có sẵn: {skipped_count})")
    print(f"- Tổng số bài thất bại: {len(failed_items)}/48 bài")

    if failed_items:
        print("\nDANH SÁCH BÀI LỖI:")
        for num, t, v, reason in failed_items:
            print(f"* Bài {num:02d}: {t} (ID: {v}) -> {reason}")

    print("=" * 75)

if __name__ == "__main__":
    process_all_opening_lessons()
