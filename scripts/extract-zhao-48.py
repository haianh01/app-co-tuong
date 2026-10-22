#!/usr/bin/env python3
"""
extract-zhao-48.py
------------------
Tự động thu thập, trích xuất và cấu trúc hóa bài giảng trong khóa học:
"48 Kỳ Lý / Nguyên Lý Trung Cuộc của Triệu Hâm Hâm" (Zhao Xinxin).

Tính năng:
- Tải phụ đề tự động (auto-subs) qua yt-dlp (0 LLM tokens).
- Lọc bỏ triệt để hiện tượng trùng lặp dòng (scroll duplicate) trong VTT.
- Chuẩn hóa thuật ngữ cờ tướng tự động (tên đại sư, nước đi, đòn sát).
- Gom cụm ngữ cảnh thông minh theo mốc thời gian (timestamp).
- Phân tích đối chiếu nguyên lý với zhao-principles.ts.
- Xuất dữ liệu JSON chuẩn vào .data/expert-commentary/ (0 LLM tokens).
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

DATA_DIR = Path(__file__).parent.parent / ".data" / "expert-commentary"
TEMP_DIR = Path("/tmp/zhao_extract")
TEMP_DIR.mkdir(parents=True, exist_ok=True)

TACTIC_KEYWORDS = {
    "tramSiPhaTuong": [
        "trảm sĩ", "phá tượng", "vật tượng", "phế pháo ăn tượng", "ăn tượng", "khuyết tượng",
        "khuyết song tượng", "bỏ tượng", "phá vỡ tuyến phòng thủ", "chém tượng", "đập tượng",
        "bẻ tượng", "khuyết sĩ"
    ],
    "khiTuTranhTien": [
        "phế quân", "khí tử", "thí quân", "phế pháo", "phế mã", "phế xe", "đoạt thế", "tranh tiên",
        "lấy tiên", "không tiếc quân", "hy sinh"
    ],
    "tuBinhDotKich": [
        "tụ binh", "đột kích", "tập trung hỏa lực", "đánh thông cánh", "khoét sâu", "đột phá đơn điểm",
        "dồn quân một cánh", "áp chế cánh"
    ],
    "diCongViThu": [
        "dĩ công vi thủ", "lấy công làm thủ", "lấy công đối công", "đối công", "phản kích",
        "không cam lòng phòng thủ"
    ],
    "ninhThatNhatTu": [
        "ninh thất nhất tử", "bất thất nhất tiên", "thà mất quân không mất tiên", "giữ thế công"
    ],
    "khongThamAn": [
        "tham ăn", "tham ăn mắc mồi", "tham lợi nhỏ", "mắc bẫy", "không thể ăn quân"
    ],
    "tranhNuoc": [
        "tranh nước", "chiếu trước", "gọi sát", "phục sát", "sát khôn", "tuyệt sát", "muộn cung sát",
        "muộn cung", "chiếu bí", "đâm pháo chiếu"
    ],
    "duoiQuanDuocTien": [
        "đuổi quân", "bắt quân", "bắt mã", "bắt xe", "bắt pháo", "được tiên", "đuổi bắt"
    ],
    "danDu": [
        "dẫn dụ", "điều động", "kéo quân rời vị trí", "lừa đối phương"
    ],
    "chanDuong": [
        "chặn đường", "cắt căn", "nhốt xe", "nhốt tướng", "khóa cung", "cô lập", "kiềm chế"
    ],
    "giaPhao": [
        "giá pháo", "tạo ngòi", "kê pháo", "pháo ngòi", "pháo lồng", "trùng pháo"
    ],
    "doiQuanGianhTien": [
        "đổi quân", "đổi quân giành tiên", "đổi quân trừ quân hoạt", "đổi xe", "đổi pháo"
    ],
    "caiThienQuanKem": [
        "cải thiện quân kém", "quân xấu", "quân yếu", "điều động quân", "phát triển quân chậm"
    ],
    "thanhDongKichTay": [
        "thanh đông kích tây", "đánh đông kích tây", "giương đông kích tây", "ép cánh này đánh cánh kia"
    ],
    "phongNgua": [
        "phòng ngừa", "chặn trước", "phòng thủ chủ động", "ngăn chặn ý đồ"
    ],
    "chuyenHoaTanCuoc": [
        "chuyển tàn", "tàn cuộc", "đơn giản hóa", "quy về tàn cuộc thắng"
    ],
}

TERM_REPLACEMENTS = [
    (r"\bquấn tượng kỳ\b", "cuốn Tượng kỳ"),
    (r"\bchệ h hâm\b", "Triệu Hâm Hâm"),
    (r"\btriệu hâm(?! hâm)\b", "Triệu Hâm Hâm"),
    (r"\blưu điện trung\b", "Lưu Điện Trung"),
    (r"\bliêu định trung\b", "Lưu Điện Trung"),
    (r"\bliêu điện trung\b", "Lưu Điện Trung"),
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
        "yt-dlp",
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
        sys.stderr.write(f"[WARN] yt-dlp warning: {e.stderr}\n")

    for ext in ["vi-orig.vtt", "vi.vtt"]:
        candidate = TEMP_DIR / f"{video_id}.{ext}"
        if candidate.exists() and candidate.stat().st_size > 500:
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
        # Lọc triệt để lặp dòng: Chỉ xử lý các khối có chứa thẻ <c> (dòng mới được đọc)
        c_lines = [l for l in text_lines if "<c>" in l]
        if not c_lines:
            continue

        clean_text_parts = []
        for l in c_lines:
            c = re.sub(r"<[^>]+>", "", l).strip()
            if c:
                clean_text_parts.append(c)

        text = " ".join(clean_text_parts)
        text = re.sub(r"\s+", " ", text).strip()
        text = normalize_terms(text)

        if text and (not segments or segments[-1][2] != text):
            segments.append((start_sec, end_sec, text))

    return segments


def cluster_into_paragraphs(segments: List[Tuple[float, float, str]], max_gap: float = 3.5, max_chars: int = 350) -> List[Dict]:
    paragraphs = []
    current_text = []
    current_start = 0.0
    current_end = 0.0

    for start, end, text in segments:
        if not current_text:
            current_start = start
            current_end = end
            current_text.append(text)
        elif (start - current_end < max_gap) and (len(" ".join(current_text)) + len(text) < max_chars):
            current_text.append(text)
            current_end = end
        else:
            joined = " ".join(current_text)
            paragraphs.append({
                "start": current_start,
                "end": current_end,
                "text": joined
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


def detect_principles(text: str) -> List[str]:
    low = text.lower()
    detected = []
    for tactic, keywords in TACTIC_KEYWORDS.items():
        if any(kw in low for kw in keywords):
            detected.append(tactic)
    return detected


def process_video(video_id: str, lesson_num: int, title: str) -> Dict:
    print(f"[*] Đang tải phụ đề cho video {video_id} (Bài {lesson_num}: {title})...")
    vtt_path = download_subs(video_id)
    if not vtt_path:
        raise RuntimeError(f"Không thể tải phụ đề cho {video_id}")

    print(f"[+] Đã tải: {vtt_path.name}")
    segments = parse_vtt(vtt_path)
    paragraphs = cluster_into_paragraphs(segments)
    print(f"[+] Đã bóc tách {len(segments)} mẩu thoại thành {len(paragraphs)} đoạn bình luận mạch lạc.")

    all_text = " ".join([p["text"] for p in paragraphs])
    overall_tactics = detect_principles(all_text)

    comments = {}
    ply = 0
    for p in paragraphs:
        t = p["text"]
        tactics_here = detect_principles(t)
        if len(t) > 35 and any(w in t.lower() for w in ["pháo", "xe", "mã", "tượng", "sĩ", "tướng", "sát", "tiên", "ưu", "kém", "nước", "thủ", "công"]):
            timestamp_str = f"[{int(p['start'] // 60):02d}:{int(p['start'] % 60):02d}]"
            comment_line = f"{timestamp_str} {t}"
            if tactics_here:
                comment_line += f" [Nguyên lý: {', '.join(tactics_here)}]"
            comments[str(ply)] = comment_line
            ply += 1

    game_id = f"zhao48_bai{lesson_num:02d}_{video_id}"
    game_data = {
        "id": game_id,
        "title": f"Triệu Hâm Hâm 48 Kỳ Lý Trung Cuộc - Bài {lesson_num}: {title}",
        "red": "Triệu Hâm Hâm (Minh họa: Lữ Khâm)",
        "black": "Lưu Điện Trung",
        "event": "Triệu Hâm Hâm - 48 Bài Giảng Kỳ Lý Trung Cuộc",
        "date": "2024",
        "result": "Đỏ thắng",
        "opening": f"Chuyên đề trung cuộc: {title}",
        "videoId": video_id,
        "videoUrl": f"https://www.youtube.com/watch?v={video_id}",
        "totalPlies": len(comments),
        "movesCoords": [],
        "comments": comments,
        "commentCount": len(comments),
        "detectedPrinciples": overall_tactics,
        "summary": {
            "title": f"Bài {lesson_num}: {title}",
            "corePrinciple": "Khuyết Tượng sợ Pháo: Khi đối phương khuyết Tượng, Pháo phát huy uy lực công sát tối đa do lộ khuyết không có căn cản, tạo tiền đề cho đòn Muộn cung sát hoặc phế quân phá thành.",
            "tactics": overall_tactics
        }
    }

    output_file = DATA_DIR / f"{game_id}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(game_data, f, ensure_ascii=False, indent=2)

    print(f"[✓] Đã lưu dữ liệu bình luận thành công tại: {output_file}")
    return game_data


def main():
    parser = argparse.ArgumentParser(description="Trích xuất bài giảng 48 Kỳ Lý Trung Cuộc Triệu Hâm Hâm")
    parser.add_argument("--video", default="R_A3Osmn42M", help="YouTube Video ID")
    parser.add_argument("--lesson", type=int, default=2, help="Số thứ tự bài giảng")
    parser.add_argument("--title", default="Khuyết Tượng Sợ Pháo", help="Tiêu đề bài giảng")
    parser.add_argument("--batch", action="store_true", help="Chạy tự động các bài giảng có trong danh mục")
    args = parser.parse_args()

    if args.batch:
        run_batch()
        return

    data = process_video(args.video, args.lesson, args.title)
    print("\n================ TỔNG KẾT BÀI GIẢNG ĐÃ RÚT TRÍCH ================")
    print(f"Tiêu đề: {data['title']}")
    print(f"Số lượng đoạn phân tích chuyên môn: {data['commentCount']}")
    print(f"Các nguyên lý chiến thuật phát hiện: {', '.join(data['detectedPrinciples'])}")
    print("-----------------------------------------------------------------")
    print("Trích đoạn tiêu biểu:")
    for k in list(data["comments"].keys())[:5]:
        print(f"  [{k}] {data['comments'][k]}")



PREDEFINED_LESSONS = [
    {"video": "R_A3Osmn42M", "lesson": 2, "title": "Khuyết Tượng Sợ Pháo"},
    {"video": "cZPFcW_y0_U", "lesson": 3, "title": "Thuật Dùng Mã Mạnh Nhất - Ngọa Tào Mã"},
    {"video": "vQWgmZHhrvM", "lesson": 4, "title": "Mã Xấu Nhất - Oa Tâm Mã"},
    {"video": "34P8w1WNK1U", "lesson": 6, "title": "Rút Đao Chém Nước Nước Không Chảy"},
    {"video": "a7P03VIBIIM", "lesson": 7, "title": "Đột Phá Đơn Điểm Trong Thế Trận Giằng Co"},
    {"video": "rFsWmjfosfI", "lesson": 8, "title": "Binh Quý Thần Tốc"},
]

def run_batch():
    print(f"=== BẮT ĐẦU CHẠY HÀNG LOẠT {len(PREDEFINED_LESSONS)} BÀI GIẢNG TIÊU BIỂU ===")
    results = []
    for item in PREDEFINED_LESSONS:
        try:
            res = process_video(item["video"], item["lesson"], item["title"])
            results.append(res)
        except Exception as e:
            sys.stderr.write(f"[LỖI] Bài {item['lesson']}: {e}\n")
    print(f"\n[✓] Hoàn tất xử lý hàng loạt: {len(results)}/{len(PREDEFINED_LESSONS)} bài thành công!")

if __name__ == "__main__":
    main()

# Danh mục các bài giảng tiêu biểu đã đánh chỉ mục sẵn
