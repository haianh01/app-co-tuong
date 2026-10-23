#!/usr/bin/env python3
"""
extract-zhao-endgame.py
-----------------------
Trích xuất phụ đề và tạo cấu trúc JSON cho 48 bài giảng Tàn cuộc của Triệu Hâm Hâm (Zhao Xinxin).
"""

import os
import re
import json
import subprocess
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / ".data" / "expert-commentary"
TEMP_DIR = Path("/tmp/zhao_endgame")
TEMP_DIR.mkdir(parents=True, exist_ok=True)

ENDGAME_LESSONS = [
    # Batch 1 (Bài 1 - 6)
    {"lesson": 1, "video": "-M048nOYU0I", "title": "Tại Sao Cần Học Tàn Cuộc"},
    {"lesson": 2, "video": "s8wOya9HGVM", "title": "Phân Loại Tàn Cục - 4 Loại Hình Tàn Cuộc Cơ Bản"},
    {"lesson": 3, "video": "HriX5ETJ52A", "title": "Điểm Tới Hạn Của Binh Lực - Hơn 2 Chốt Có Chắc Thắng?"},
    {"lesson": 4, "video": "tepNEiE7FJU", "title": "Binh Và Tàn Sĩ Tượng - Tốt Phá Khuyết Sĩ Tượng"},
    {"lesson": 5, "video": "wBOQuix_tpc", "title": "Mưu Đoạt Chốt - Tàn Cuộc Có Xe"},
    {"lesson": 6, "video": "XXpTFNBdJrM", "title": "Mưu Đoạt Chốt - Tàn Cuộc Không Có Xe"},
    # Batch 2 (Bài 7 - 12)
    {"lesson": 7, "video": "hFaP9upTB-w", "title": "Tuyệt Kỹ Phá Sĩ Tượng - Tàn Cuộc Có Xe"},
    {"lesson": 8, "video": "1wpanrf2XUc", "title": "Tuyệt Kỹ Phá Sĩ Tượng - Tàn Cuộc Không Có Xe"},
    {"lesson": 9, "video": "w-0PzwsDpEM", "title": "Nguyên Tắc Chiếm Trung - Chìa Khóa Sống Còn Trong Cờ Tàn"},
    {"lesson": 10, "video": "HVun2kG58LE", "title": "Lộ Sườn Và Tuyến Sinh Mệnh - Tuyến Áp Đáy"},
    {"lesson": 11, "video": "tQkFXamj6s4", "title": "Mã Hoạt Đem Lại Chiến Thắng - Mã Ngọa Tào Và Điểm Huyệt"},
    {"lesson": 12, "video": "20HzC6oMzNw", "title": "Bảng Xếp Hạng Phối Hợp Binh Chủng Mạnh Nhất Trong Cờ Tàn"},
    # Batch 3 (Bài 13 - 18)
    {"lesson": 13, "video": "Mt7cOJyVw6w", "title": "Binh Chủng Hữu Lợi - Tại Sao Mã Pháo Mạnh Hơn Song Pháo"},
    {"lesson": 14, "video": "ko40Hq7h9v4", "title": "Bí Quyết Chọn Thời Điểm Tấn Tốt - Binh Quý Thần Tốc"},
    {"lesson": 15, "video": "P43P3lsCS-U", "title": "Tuyệt Kỹ Dùng Sĩ Tượng Phong Ấn Song Mã"},
    {"lesson": 16, "video": "Ko55ZmZPuVI", "title": "Giữ Vị Trí Tướng Linh Hoạt Trong Cờ Tàn"},
    {"lesson": 17, "video": "RoGgqcs7Tho", "title": "Chốt Lụt Vĩnh Viễn Không Chết - Lão Binh"},
    {"lesson": 18, "video": "DaPsULPGIuU", "title": "Khuyết Sĩ Kỵ Gì - Khuyết Sĩ Kỵ Song Xe Song Pháo"},
    # Batch 4 (Bài 19 - 24)
    {"lesson": 19, "video": "jUUsLOiP1uA", "title": "Khuyết Tượng Sợ Pháo - Tuyệt Kỹ Môn Cung Sát Cục Đỉnh Cao"},
    {"lesson": 20, "video": "Q6jMjsM3HRQ", "title": "Cờ Tàn Pháo Hoàn - Nguyên Tắc Sống Còn Của Quân Pháo"},
    {"lesson": 21, "video": "amVASIEKTlg", "title": "Dọn Tốt Khống Chế Tuyến - Thủ Pháp Phòng Thủ Đỉnh Cao"},
    {"lesson": 22, "video": "jM43iVKLiP8", "title": "Mã vs Pháo Trong Tàn Cuộc - Sức Mạnh Định Vị Và Kiểm Soát Không Gian"},
    {"lesson": 23, "video": "eIo0wo1GCGc", "title": "Chiến Thuật Cờ Tàn Chủ Yếu - Phép Kiềm Chế Khóa Chặt Đối Thủ"},
    {"lesson": 24, "video": "yX31jXr2Tuo", "title": "Chiến Thuật Cờ Tàn Chủ Yếu - Nước Chờ Đợi Thời Cơ"},
    # Batch 5 (Bài 25 - 30)
    {"lesson": 25, "video": "WoAbngtSdTM", "title": "Chiến Thuật Cờ Tàn Chủ Yếu - Vây Khốn Bắt Chết Quân Lớn"},
    {"lesson": 26, "video": "b7SZnVTtLkM", "title": "Kỹ Thuật Đốn Tỏa - Nghệ Thuật Điều Quân Khiến Đối Thủ Tắt Thở"},
    {"lesson": 27, "video": "PRy4jSbJRPo", "title": "Kỹ Thuật Đánh Chặn - Tầm Quan Trọng Của Tư Duy Đại Cục"},
    {"lesson": 28, "video": "RbhN1vumxek", "title": "Chiến Thuật Cầu Hòa - Bài Học Xương Máu Về Sự Khắc Nghiệt Của Cờ Tàn"},
    {"lesson": 29, "video": "akTcbzh1MaM", "title": "Chiến Thuật Sấm Sét - Lấy Nhanh Đánh Chậm Sát Cục Bất Ngờ"},
    {"lesson": 30, "video": "DvaUWgJFvJk", "title": "Tuyệt Đỉnh Tàn Cuộc Xe Pháo - Xe Pháo Hợp Công Sát Cục"},
    # Batch 6 (Bài 31 - 36)
    {"lesson": 31, "video": "ViC0z9if74M", "title": "Xe Mã Lãnh Chiêu - Từ Cổ Phổ Đến Thực Chiến Đỉnh Cao"},
    {"lesson": 32, "video": "dx9Kmpo_yho", "title": "Kỹ Thuật Xe Chốt Phá Sĩ Tượng - Đòn Diệu Thủ Của Hồ Vinh Hoa"},
    {"lesson": 33, "video": "zCWkJ5v8aTw", "title": "Tàn Cuộc Song Mã Song Pháo - Đại Binh Đoàn Tác Chiến"},
    {"lesson": 34, "video": "mO3mG0KZRcQ", "title": "Tàn Cuộc Song Mã Pháo Đối Mã Song Pháo - Xoay Chuyển Càn Khôn"},
    {"lesson": 35, "video": "Au7TR2QgniY", "title": "Lý Thuyết Cốt Lõi Của Tàn Cuộc Mã Pháo Đối Mã Pháo"},
    {"lesson": 36, "video": "kF1lZytRkNg", "title": "Tàn Cuộc Song Pháo Đối Song Mã - Pháo Khống Chế Mã"},
    # Batch 7 (Bài 37 - 42)
    {"lesson": 37, "video": "_TxJNNeHi7A", "title": "Tàn Cuộc Mã Tốt Đối Pháo Tốt - Mã Khống Chế Tuyến Phá Pháo Tốt"},
    {"lesson": 38, "video": "QaUMyl-30g4", "title": "Tam Anh Chiến Lữ Bố - Đơn Xe Phá Tan Quần Hùng Mã Pháo Tốt"},
    {"lesson": 39, "video": "DTlMu7DsQdU", "title": "Mã Tốt Đáy Thắng Đơn Sĩ Tượng - Nghệ Thuật Ép Cung Sát Cục"},
    {"lesson": 40, "video": "lIpw6oiD9EM", "title": "Xe Pháo Khuyết Sĩ Thắng Xe Pháo - Tuyệt Kỹ Hải Để Lao Nguyệt"},
    {"lesson": 41, "video": "PCukWSQ4sQE", "title": "Xe Pháo Đơn Sĩ Đối Xe Song Tượng - Sát Pháp Càn Khôn Đại Nã Di"},
    {"lesson": 42, "video": "U80kaWbbXAk", "title": "Xe Mã Đối Xe Song Tượng - Giải Mã Bài Toán Thế Kỷ"},
    # Batch 8 (Bài 43 - 48)
    {"lesson": 43, "video": "Uj1voqULEp4", "title": "Cạm Bẫy Giăng Kín Trong Cờ Thế Thất Tinh Tụ Hội"},
    {"lesson": 44, "video": "Q-KyLnoNcEs", "title": "Giải Mã Tứ Đại Danh Cuộc - Khâu Dẫn Hàng Long Bầy Tốt Trói Chặt Song Xe"},
    {"lesson": 45, "video": "naUZGByE95w", "title": "Cờ Thế Giang Hồ Dã Mã Thao Điền - Sức Mạnh Đáng Sợ Của Xe Mã Lãnh Chiêu"},
    {"lesson": 46, "video": "EuSeQTFCa_M", "title": "Thiên Lý Độc Hành - Bí Ẩn Ván Cờ Tuyệt Kỹ Tàn Cuộc Đơn Mã"},
    {"lesson": 47, "video": "M16GyhAmi_Q", "title": "Bài Học Xương Máu Về Chiến Thuật Và Tâm Lý Trong Tàn Cuộc Thực Chiến"},
    {"lesson": 48, "video": "NzESbWX8YKo", "title": "Bản Chất Cốt Lõi Của Tàn Cuộc - Đỉnh Cao Triết Lý Cờ Tàn"},
]

def parse_vtt(vtt_path: Path):
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

def cluster_paragraphs(segments, max_gap=3.5, max_chars=350):
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

def process_lessons(lesson_list):
    for item in lesson_list:
        vid = item["video"]
        lesson_num = item["lesson"]
        vtt = TEMP_DIR / f"{vid}.vi-orig.vtt"
        if not vtt.exists():
            vtt = TEMP_DIR / f"{vid}.vi.vtt"
        if not vtt.exists():
            print(f"[SKIP] VTT not found for Lesson {lesson_num} ({vid})")
            continue

        segments = parse_vtt(vtt)
        paras = cluster_paragraphs(segments)

        transcript = {}
        for idx, p in enumerate(paras):
            m = int(p["start"] // 60)
            s = int(p["start"] % 60)
            at_str = f"{m:02d}:{s:02d}"
            text_val = p["text"]
            transcript[str(idx)] = f"[{at_str}] {text_val}"

        out_file = DATA_DIR / f"zhao48_endgame_bai{lesson_num:02d}_{vid}.json"
        data = {
            "id": f"zhao48_endgame_bai{lesson_num:02d}_{vid}",
            "title": f"Triệu Hâm Hâm 48 Kỳ Lý Tàn Cuộc - Bài {lesson_num}: {item['title']}",
            "videoId": vid,
            "videoUrl": f"https://www.youtube.com/watch?v={vid}",
            "lesson": lesson_num,
            "topic": item["title"],
            "transcript": transcript,
            "summary": item["title"]
        }
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Saved Lesson {lesson_num}: {out_file.name} with {len(transcript)} entries")

if __name__ == "__main__":
    process_lessons(ENDGAME_LESSONS)
