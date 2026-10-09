import { Move, sq } from "./engine";

export interface Puzzle {
  id: string;
  chapter: string;
  title: string;
  goal: string;
  fen: string;
  hint: string;
  /** Một lời giải mẫu để hiển thị khi giải xong. Mọi nước chiếu bí khác cũng được tính là đúng. */
  solution: Move;
  solutionText: string;
}

export const PUZZLES: Puzzle[] = [
  {
    id: "bach-dien-tuong",
    chapter: "Sát cục cơ bản",
    title: "Bạch diện tướng",
    goal: "Đỏ đi trước, chiếu bí trong 1 nước.",
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
    fen: "3aka3/8R/7c1/p7p/2N6/9/9/9/9/5K3 w",
    hint: "Xe đã khóa hàng ngang ngay trước tướng. Mã nhảy vào \"máng\" cạnh cung tướng.",
    solution: { from: sq(4, 2), to: sq(2, 3) },
    solutionText: "M7.6",
  },
];
