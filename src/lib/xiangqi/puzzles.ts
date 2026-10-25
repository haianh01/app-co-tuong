import { Move, sq } from "./engine";
import { DEEP_PUZZLES } from "./puzzles-deep.generated";
import { GENERATED_PUZZLES } from "./puzzles.generated";

export interface Puzzle {
  id: string;
  chapter: string;
  title: string;
  goal: string;
  /** Số nước của Đỏ để thắng. */
  depth: number;
  /** Chỉ dành cho thành viên VIP. */
  vip?: boolean;
  fen: string;
  hint: string;
  /** Một lời giải mẫu để hiển thị khi giải xong. Mọi nước chiếu bí khác cũng được tính là đúng. */
  solution: Move;
  solutionText: string;
  /**
   * Thế dài (từ 3 nước) không giải vét cạn được trên trình duyệt: biến chính đã được Pikafish kiểm chứng
   * (Đỏ, Đen, Đỏ…), mỗi nước Đỏ là cách duy nhất chiếu bí kịp số nước còn lại. Đen đỡ theo biến này.
   */
  line?: Move[];
  /** Xuất xứ (sách cổ, tuyển tập), hiển thị cho người giải. */
  source?: string;
}

const CLASSIC: Puzzle[] = [
  {
    id: "bach-dien-tuong",
    chapter: "Sát cục cơ bản",
    title: "Bạch diện tướng",
    goal: "Đỏ đi trước, chiếu bí trong 1 nước.",
    depth: 1,
    fen: "3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w",
    hint: "Hai tướng không được đối mặt: tướng đen không thể bước sang cột giữa.",
    solution: { from: sq(2, 8), to: sq(2, 3) },
    solutionText: "X1-6",
  },
  {
    id: "trung-phao",
    chapter: "Sát cục cơ bản",
    title: "Trùng pháo",
    goal: "Đỏ đi trước, chiếu bí trong 1 nước.",
    depth: 1,
    fen: "2bakab2/9/9/p1p3p1p/9/4C4/9/C8/9/3K5 w",
    hint: "Một pháo làm ngòi cho pháo kia trên cùng cột giữa.",
    solution: { from: sq(7, 0), to: sq(7, 4) },
    solutionText: "P9-5",
  },
  {
    id: "ngoa-tao-ma",
    chapter: "Sát cục cơ bản",
    title: "Ngọa tào mã",
    goal: "Đỏ đi trước, chiếu bí trong 1 nước.",
    depth: 1,
    fen: "3aka3/8R/7c1/p7p/2N6/9/9/9/9/5K3 w",
    hint: "Xe đã khóa hàng ngang ngay trước tướng. Mã nhảy vào \"máng\" cạnh cung tướng.",
    solution: { from: sq(4, 2), to: sq(2, 3) },
    solutionText: "M7.6",
  },
];

/** Chương miễn phí gợi ý (hướng dẫn cho người mới). */
export const FREE_HINT_CHAPTER = "Sát cục cơ bản";

export const PUZZLES: Puzzle[] = [...CLASSIC, ...GENERATED_PUZZLES, ...DEEP_PUZZLES];

export const findPuzzle = (id: string) => PUZZLES.find((p) => p.id === id);
