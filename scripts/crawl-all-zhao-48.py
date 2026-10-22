#!/usr/bin/env python3
"""
crawl-all-zhao-48.py
--------------------
Thu thập và cấu trúc hóa hàng loạt toàn bộ 48 bài giảng trong bộ:
"48 Kỳ Lý Trung Cuộc của Triệu Hâm Hâm" (Zhao Xinxin).

Chia làm 2 Thiên lớn:
1. Thiên 1: MƯU THẾ (Chiếm Đoạt Thế Trận: Bài 1 -> Bài 24)
2. Thiên 2: MƯU TỬ (Chiếm Đoạt Binh Lực / Bắt Quân: Bài 25 -> Bài 48)

Quy trình: 100% Offline trên máy (0 LLM tokens).
"""

import sys
import json
import importlib.util
from pathlib import Path

# Load process_video từ extract-zhao-48.py
script_path = Path(__file__).parent / "extract-zhao-48.py"
spec = importlib.util.spec_from_file_location("extract_zhao_48", script_path)
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)

DATA_DIR = Path(__file__).parent.parent / ".data" / "expert-commentary"

# Danh mục đầy đủ 48 bài giảng với Video ID chính và các Video ID dự phòng
FULL_48_LESSONS = [
    # ==================== THIÊN 1: MƯU THẾ (BÀI 1 - 24) ====================
    {"lesson": 1, "video": "n3SbgwL1GAI", "fallbacks": ["KocLim-MDLU", "cB9N_kW8ToM"], "title": "Khuyết Sĩ Kỵ Song Xe"},
    {"lesson": 2, "video": "R_A3Osmn42M", "fallbacks": ["kW099B8b3dc", "TvPEzi7OXps"], "title": "Khuyết Tượng Sợ Pháo"},
    {"lesson": 3, "video": "cZPFcW_y0_U", "fallbacks": ["jHs1bkkjoBA", "gDbPAgQ1kjI"], "title": "Thuật Dùng Mã Mạnh Nhất - Ngọa Tào Mã"},
    {"lesson": 4, "video": "vQWgmZHhrvM", "fallbacks": ["1aJLFE6MQqY", "h6ZOvCbmQKA"], "title": "Mã Xấu Nhất - Oa Tâm Mã"},
    {"lesson": 5, "video": "uCcMcMlEF7k", "fallbacks": ["OiZGTEozD6M", "4QKVwgAuwR8"], "title": "Hơn Quân Cần Giản Hóa"},
    {"lesson": 6, "video": "34P8w1WNK1U", "fallbacks": ["snI-HgA7U-M", "4XxTrZcD6Qo"], "title": "Rút Đao Chém Nước Nước Không Chảy"},
    {"lesson": 7, "video": "a7P03VIBIIM", "fallbacks": ["3i4q-Malpz8", "9LpbIroo4II"], "title": "Đột Phá Đơn Điểm Trong Thế Trận Giằng Co"},
    {"lesson": 8, "video": "rFsWmjfosfI", "fallbacks": ["ExPDMtlQznY", "JwCWBjX6iDU"], "title": "Binh Quý Thần Tốc"},
    {"lesson": 9, "video": "6iA-ro90dus", "fallbacks": ["h9aKtB5e3HA", "5EXFc9f_fRI"], "title": "Máy Ủi Trung Lộ Chiến Thuật Nghiền Ép"},
    {"lesson": 10, "video": "Pb8j35bP298", "fallbacks": ["9ppJNqRPgPo", "C5-xzi_xgbg"], "title": "Phế Quân Tấn Công Mạnh Trung Lộ"},
    {"lesson": 11, "video": "DWGGNkDgyfY", "fallbacks": ["eP1MD5vcdTM"], "title": "Chiến Thuật Đoạt Trung Binh"},
    {"lesson": 12, "video": "jfLmuyrvMrI", "fallbacks": ["ImMcrbJr2E4", "OGBOU9mmlEc"], "title": "Khi Nào Mới Có Thể Thí Không Đầu Pháo"},
    {"lesson": 13, "video": "k61L-23ui9E", "fallbacks": ["R-15fkniln0", "bQrnRcv6fTg"], "title": "Pháo Chìm Đáy - Nghệ Thuật Phá Trận & Lật Kèo"},
    {"lesson": 14, "video": "hFHV0qTyIrE", "fallbacks": ["bYPogqqQU60", "hvzN2S3fPno"], "title": "Pháo Trầm Đáy Kiềm Chế & Hỗ Trợ Công Kích"},
    {"lesson": 15, "video": "eqlMcvRqXSI", "fallbacks": ["M4Q_ddI7Z7Y", "JPelZ9qC1zg"], "title": "Pháo Chìm Đáy Phong Tỏa Xe"},
    {"lesson": 16, "video": "8X-Osk2XgYk", "fallbacks": ["aWh3iPeBqbg", "kR6kfHTopIk"], "title": "Oanh Tạc Lộ Sườn - Tuyệt Kỹ Tấn Công Tổng Lực"},
    {"lesson": 17, "video": "yFP2J4KXYGk", "fallbacks": ["gdN_47zNYa0", "aE-Ztiralos"], "title": "Mãnh Công Hoành Lộ Hai / Tuyến Đáy"},
    {"lesson": 18, "video": "D8bW-lek-_0", "fallbacks": ["8Gw7q-O73YU", "TZN4C8A-9to"], "title": "Kiềm Chế Tuyến Đỉnh Cung"},
    {"lesson": 19, "video": "X3aedn530Ak", "fallbacks": ["r5pzsBtfTtw", "8bK1-R2-bPs"], "title": "Tầm Quan Trọng Tuyến Tốt"},
    {"lesson": 20, "video": "_-X-gZZFoU4", "fallbacks": ["xlPpMxFn394"], "title": "Khống Chế Tuyến Kỵ Hà"},
    {"lesson": 21, "video": "KW6TAmBYHXg", "fallbacks": ["gzSm4ouFaKA"], "title": "Tranh Đoạt Tuyến Lộ 3 và Lộ 7"},
    {"lesson": 22, "video": "EUrvdLXl62w", "fallbacks": ["vBq7js7xGLA"], "title": "Phong Tỏa & Phản Phong Tỏa Lộ Xe"},
    {"lesson": 23, "video": "NomvtxiDvmQ", "fallbacks": ["1pR_6pYMDkQ"], "title": "Tập Kích Đường Biên - Tốt Biên Đại Náo"},
    {"lesson": 24, "video": "Z5179E1yznE", "fallbacks": ["KXU4VMyNzWA"], "title": "Đặt Đúng Quân Vào Đúng Vị Trí (Tổng Kết Mưu Thế)"},

    # ==================== THIÊN 2: MƯU TỬ (BÀI 25 - 48) ====================
    {"lesson": 25, "video": "2pSLdJML3JA", "fallbacks": ["j4Y8ffMx-W0", "qiioqyLr_gk"], "title": "Sự Kết Hợp Bá Đạo Của Song Xe"},
    {"lesson": 26, "video": "ht8q7N7T27w", "fallbacks": ["bWElCPYqAr0", "BYSx99YJn2g"], "title": "Pháo Gánh & Đạn Tử Pháo - Công Thủ Toàn Diện"},
    {"lesson": 27, "video": "csCCH9iFuXY", "fallbacks": ["lFYkI_M53rE"], "title": "Liên Hoàn Mã: Màn Báo Thù Pháo Gánh Kinh Điển"},
    {"lesson": 28, "video": "IcVy4feukRk", "fallbacks": ["Yd73bg8WD4Q", "Jh8oCUGBFoU"], "title": "Xe Mã Pháo - Tổ Hợp Mạnh Nhất"},
    {"lesson": 29, "video": "-p04Yf_GH2E", "fallbacks": ["DyPNedAdcIk"], "title": "Xe Song Mã Thiên La Địa Võng"},
    {"lesson": 30, "video": "NuoAEXFCx4w", "fallbacks": ["Qjj2A7dBJaA"], "title": "Xe Song Pháo Hỏa Lực Mạnh Nhất"},
    {"lesson": 31, "video": "ViC0z9if74M", "fallbacks": [], "title": "Chiến Thuật Vây Mã - Lãnh Cung Mã"},
    {"lesson": 32, "video": "dx9Kmpo_yho", "fallbacks": ["tQMSpMBpSyw"], "title": "Khéo Phá Sĩ Tượng"},
    {"lesson": 33, "video": "g2Ct62PQb7g", "fallbacks": ["TDn-yqR4WWk"], "title": "Phế Quân Phá Sĩ Tượng"},
    {"lesson": 34, "video": "QWwoW09k-9I", "fallbacks": [], "title": "Chiến Thuật Bao Vây - Cô Quân Thâm Nhập"},
    {"lesson": 35, "video": "-3FYQMq82jc", "fallbacks": [], "title": "Nghệ Thuật Vây Thành - Bẫy Cô Quân"},
    {"lesson": 36, "video": "wCOZo2du4tI", "fallbacks": [], "title": "Chiến Thuật Vây Chết Mã - Mã Phùng Biên Tất Vong"},
    {"lesson": 37, "video": "XnKqnZHqkxU", "fallbacks": [], "title": "Vây Mã Giác - Đánh Ép Hai Cánh"},
    {"lesson": 38, "video": "g4cHlsZdbWM", "fallbacks": ["54c8a-xQPxc"], "title": "Vũ Khí Tầm Ngắn Thắng Tầm Xa - Xe Song Mã"},
    {"lesson": 39, "video": "LfUxki_IZaA", "fallbacks": ["3fKcD-z7N1A"], "title": "Vũ Khí Tầm Xa Thắng Tầm Ngắn - Xe Song Pháo"},
    {"lesson": 40, "video": "Zmi0Dgxw_RM", "fallbacks": ["kR9U4gC_aPs", "wTTdb07Pb6g"], "title": "Một Xe Đổi Hai: Ưu và Nhược"},
    {"lesson": 41, "video": "6BfGoFdJkFE", "fallbacks": ["ycnFetNjfcU"], "title": "Một Xe Đổi Ba: Liều Mạng Tam Lang"},
    {"lesson": 42, "video": "4Dv7Z8hGBwE", "fallbacks": ["i4vSTeH0Quc"], "title": "Mã Vận Như Long - Kim Thương Bàn Mã"},
    {"lesson": 43, "video": "oLr-I_nSAFc", "fallbacks": [], "title": "Binh Pháp Diệu Dụng - Tung Hoành Ngang Dọc"},
    {"lesson": 44, "video": "P9e5aGjepDY", "fallbacks": ["2GqpYLTwiBM"], "title": "5 Nguyên Tắc Vàng Nghệ Thuật Vận Pháo"},
    {"lesson": 45, "video": "VLKh7DCmxoM", "fallbacks": [], "title": "Tiểu Binh Lập Đại Công - 5 Nguyên Tắc Dùng Tốt"},
    {"lesson": 46, "video": "Fta7FlPnBXg", "fallbacks": [], "title": "Phế Tốt Phản Công"},
    {"lesson": 47, "video": "bvT-dKCB-xU", "fallbacks": [], "title": "Chiến Thuật Mưu Binh - Binh Bất Huyết Nhẫn"},
    {"lesson": 48, "video": "P1vUbC9nw24", "fallbacks": [], "title": "Cục Bộ Lấy Nhiều Đánh Ít (Tổng Kết Mưu Tử)"},
]


def check_existing(lesson_num: int):
    pattern = f"zhao48_bai{lesson_num:02d}_*.json"
    files = list(DATA_DIR.glob(pattern))
    if files:
        f = files[0]
        try:
            with open(f, "r", encoding="utf-8") as fp:
                d = json.load(fp)
            if d.get("commentCount", 0) > 0:
                return f, d["commentCount"]
        except Exception:
            pass
    return None, 0


def main():
    print("=" * 75)
    print("BẮT ĐẦU CÀO TOÀN BỘ DANH MỤC 48 BÀI GIẢNG KỲ LÝ TRUNG CUỘC TRIỆU HÂM HÂM")
    print(f"Thư mục lưu trữ: {DATA_DIR}")
    print("=" * 75 + "\n")

    success_lessons = {}
    failed_lessons = {}

    for item in FULL_48_LESSONS:
        lesson = item["lesson"]
        title = item["title"]
        vid = item["video"]
        fallbacks = item.get("fallbacks", [])

        # Kiểm tra file đã có sẵn chưa
        existing_file, count = check_existing(lesson)
        if existing_file:
            print(f"[Bài {lesson:02d}] ĐÃ CÓ SẴN: {existing_file.name} ({count} đoạn bình luận) -> Bỏ qua")
            success_lessons[lesson] = {
                "title": title,
                "video": vid,
                "file": existing_file.name,
                "count": count,
                "status": "cached"
            }
            continue

        print(f"[Bài {lesson:02d}] Đang cào: {title}...")
        crawled = False
        candidates = [vid] + fallbacks
        last_error = ""

        for candidate_vid in candidates:
            print(f"  -> Thử Video ID: {candidate_vid}")
            try:
                data = extractor.process_video(candidate_vid, lesson, title)
                count = data.get("commentCount", 0)
                if count > 0:
                    print(f"  ✓ Thành công! Trích xuất {count} đoạn bình luận (ID: {candidate_vid})")
                    success_lessons[lesson] = {
                        "title": title,
                        "video": candidate_vid,
                        "count": count,
                        "status": "downloaded"
                    }
                    crawled = True
                    break
                else:
                    last_error = "Tải được VTT nhưng không trích xuất được đoạn thoại nào (rỗng)"
            except Exception as e:
                err_msg = str(e)
                print(f"  ✗ Thất bại với ID {candidate_vid}: {err_msg}")
                last_error = err_msg

        if not crawled:
            failed_lessons[lesson] = {
                "title": title,
                "primary_video": vid,
                "candidates": candidates,
                "reason": last_error or "Không tìm thấy phụ đề hợp lệ trên YouTube (No subtitles)"
            }
            print(f"  [!] BÀI {lesson:02d} THẤT BẠI: {failed_lessons[lesson]['reason']}\n")
        else:
            print("")

    # ==================== BÁO CÁO TỔNG HỢP ====================
    print("\n" + "=" * 75)
    print("BÁO CÁO KẾT QUẢ CÀO 48 BÀI GIẢNG")
    print("=" * 75)
    print(f"- Tổng số bài thành công: {len(success_lessons)}/48 bài")
    total_comments = sum(info["count"] for info in success_lessons.values())
    print(f"- Tổng số đoạn bình luận: {total_comments} đoạn")
    print(f"- Tổng số bài thất bại: {len(failed_lessons)}/48 bài\n")

    if failed_lessons:
        print("DANH SÁCH BÀI LỖI VÀ NGUYÊN NHÂN:")
        print("-" * 75)
        for num, f_info in sorted(failed_lessons.items()):
            print(f"* Bài {num:02d}: {f_info['title']}")
            print(f"  - Video ID: {f_info['primary_video']}")
            print(f"  - Lý do lỗi: {f_info['reason']}")
        print("-" * 75)

    print("Hoàn tất.")

if __name__ == "__main__":
    main()
