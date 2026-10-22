#!/usr/bin/env python3
"""
attach-zhao-boards.py
---------------------
Gắn thế cờ (initialFen), chuỗi nước đi hợp lệ (movesCoords),
và đồng bộ bình luận chuyên gia theo từng nước đi (ply comments)
cho các bài giảng tiêu biểu trong khóa 48 Kỳ Lý Triệu Hâm Hâm.
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / ".data" / "expert-commentary"

GAME_SPECS = [
    {
        "lesson": 1,
        "initialFen": "4k4/9/9/3r3r1/4P4/9/9/9/9/R2AK4 b - - 0 1",
        "movesCoords": [
            {"from": 30, "to": 84, "raw": "3339"},
            {"from": 85, "to": 76, "raw": "4948"},
            {"from": 34, "to": 79, "raw": "7378"},
        ],
        "plyComments": {
            "1": "Phế quân phá Sĩ, trảm Sĩ chiếu tướng để xé toạc cung cấm đối phương [Nguyên lý: tramSiPhaTuong]",
            "2": "Đỏ buộc phải xuất tướng hoặc lên tầng hai chống đỡ đòn đánh",
            "3": "Song Xe hợp lực đâm chiếu tuyệt sát cục bộ khi đối phương khuyết Sĩ [Nguyên lý: tranhNuoc]",
        },
    },
    {
        "lesson": 2,
        "initialFen": "3aka3/4n4/8C/9/4P4/9/9/9/4A4/4K4 w - - 0 1",
        "movesCoords": [
            {"from": 26, "to": 8, "raw": "8280"},
        ],
        "plyComments": {
            "1": "Pháo cắm đáy chiếu tướng tuyệt sát muộn cung, Tướng bị chính Sĩ Mã chèn kẹt [Nguyên lý: muonCungSat]",
        },
    },
    {
        "lesson": 3,
        "initialFen": "2bakab2/9/8R/1N7/4P4/9/9/9/4A4/4K4 w - - 0 1",
        "movesCoords": [
            {"from": 28, "to": 11, "raw": "1321"},
            {"from": 4, "to": 13, "raw": "4041"},
            {"from": 26, "to": 17, "raw": "8281"},
        ],
        "plyComments": {
            "1": "Mã nhảy ngọa tào chiếu tướng uy hiếp cung cấm, ép Tướng phải thượng lầu [Nguyên lý: ngoaTaoMa]",
            "2": "Tướng đối phương bắt buộc phải lên tầng hai tránh đòn chiếu",
            "3": "Xe đâm chiếu hoành hai tạo đòn sát cục phối hợp Xe Mã dứt điểm [Nguyên lý: tranhNuoc]",
        },
    },
    {
        "lesson": 4,
        "initialFen": "3aka3/9/2n6/9/4P4/9/9/9/4A4/4K4 b - - 0 1",
        "movesCoords": [
            {"from": 20, "to": 13, "raw": "2241"},
            {"from": 40, "to": 31, "raw": "4443"},
        ],
        "plyComments": {
            "1": "Nước kém sai lầm thoái Mã vào hoa tim trung cung tự chèn kẹt Tướng [Nguyên lý: oaTamMa]",
            "2": "Đỏ lập tức thúc Tốt tranh tiên công phá thẳng vào hoa tim [Nguyên lý: tranhNuoc]",
        },
    },
    {
        "lesson": 5,
        "initialFen": "2naka3/9/3r5/9/2P3P2/3R5/4P4/2N6/9/3AKA3 w - - 0 1",
        "movesCoords": [
            {"from": 48, "to": 21, "raw": "3532"},
            {"from": 2, "to": 21, "raw": "2032"},
            {"from": 42, "to": 33, "raw": "6463"},
        ],
        "plyComments": {
            "1": "Đổi xe giành tiên, chủ động đơn giản hóa thế trận chuyển về tàn cuộc thắng [Nguyên lý: chuyenHoaTanCuoc]",
            "2": "Đen buộc phải ăn mã lại để tránh mất trắng quân",
            "3": "Đỏ bình tĩnh đẩy tốt hơn quân chiếm ưu thế tàn cuộc vững chắc [Nguyên lý: doiQuanGianhTien]",
        },
    },
    {
        "lesson": 8,
        "initialFen": "3ak4/9/9/9/4P4/9/9/9/3R1R3/4K4 w - - 0 1",
        "movesCoords": [
            {"from": 75, "to": 3, "raw": "3830"},
            {"from": 4, "to": 13, "raw": "4041"},
            {"from": 77, "to": 14, "raw": "5851"},
        ],
        "plyComments": {
            "1": "Binh quý thần tốc, xe đâm chiếu tướng đoạt tiên mở đòn tấn công chớp nhoáng [Nguyên lý: tranhNuoc]",
            "2": "Tướng đối phương phải thượng lầu lánh nạn",
            "3": "Song xe thần tốc đâm chiếu sát cục dứt điểm ván đấu [Nguyên lý: tranhNuoc]",
        },
    },
    {
        "lesson": 11,
        "initialFen": "3aka3/9/9/4p4/2N6/4R4/4P4/9/9/4K4 w - - 0 1",
        "movesCoords": [
            {"from": 49, "to": 31, "raw": "4543"},
            {"from": 3, "to": 13, "raw": "3041"},
            {"from": 38, "to": 21, "raw": "2432"},
        ],
        "plyComments": {
            "1": "Xe đoạt trung binh, bắt quân triệt tiêu lá chắn phòng ngự trung tâm [Nguyên lý: duoiQuanDuocTien]",
            "2": "Đen bổ sĩ phòng thủ củng cố lại cung điện",
            "3": "Mã phi qua sông đoạt thế tấn công trung lộ [Nguyên lý: tranhNuoc]",
        },
    },
    {
        "lesson": 13,
        "initialFen": "3akab2/9/1C7/9/4P4/9/9/9/4A4/4K4 w - - 0 1",
        "movesCoords": [
            {"from": 19, "to": 1, "raw": "1210"},
        ],
        "plyComments": {
            "1": "Pháo trầm đáy kiềm chế Sĩ Tượng và khóa chặt đường xuất quân của đối phương [Nguyên lý: phaoTramDay]",
        },
    },
]


def main():
    print("[*] Gắn initialFen, movesCoords và đồng bộ plyComments cho các bài tiêu biểu...")
    attached_count = 0
    for spec in GAME_SPECS:
        lesson_num = spec["lesson"]
        pattern = f"zhao48_bai{lesson_num:02d}_*.json"
        matched = list(DATA_DIR.glob(pattern))
        if not matched:
            print(f"[!] Không tìm thấy file bài {lesson_num}")
            continue

        fpath = matched[0]
        with open(fpath, "r", encoding="utf-8") as fp:
            d = json.load(fp)

        # Lưu lại videoComments gốc nếu chưa lưu
        if "videoComments" not in d:
            d["videoComments"] = d["comments"]

        # Cập nhật thông tin thế cờ và nước đi
        d["initialFen"] = spec["initialFen"]
        d["movesCoords"] = spec["movesCoords"]
        d["totalPlies"] = len(spec["movesCoords"])

        # Cập nhật các ply 1, 2, 3...
        for ply_str, comment_text in spec["plyComments"].items():
            d["comments"][ply_str] = comment_text

        with open(fpath, "w", encoding="utf-8") as fp:
            json.dump(d, fp, ensure_ascii=False, indent=2)

        attached_count += 1
        print(f" [✓] Bài {lesson_num:02d}: Đã đồng bộ FEN + {len(spec['movesCoords'])} nước đi và lời bình theo ply.")

    print(f"\n[+] Đã cập nhật thành công cho {attached_count} bài giảng!")


if __name__ == "__main__":
    main()
