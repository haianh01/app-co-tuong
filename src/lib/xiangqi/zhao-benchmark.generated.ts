// Sinh tự động bởi scripts/build-zhao-benchmark.ts — không sửa tay.
// Thế cờ trong ván đại sư (MASTER_GAMES) mà kỳ lý của bài được biến Pikafish xác nhận, kể cả khi chấm lại như modal.

export interface ZhaoBenchmarkRow {
  /** Bộ bài: 48 bài khai cuộc (zhao48-opening-lessons), 48 bài trung cuộc (zhao48-lessons) hay 48 bài tàn cuộc (zhao48-endgame-lessons), đánh số riêng. */
  book: "middlegame" | "endgame" | "opening";
  lesson: number;
  tactic: string;
  tone: "praise" | "critique" | "note";
  fen: string;
  move: string;
  moveNotation: string;
  historyMoves?: string[];
  game: { id: number; red: string; black: string; tournament: string; date: string; ply: number };
}

export const ZHAO_BENCHMARK_ROWS: ZhaoBenchmarkRow[] = [
  {
    "book": "opening",
    "lesson": 3,
    "tactic": "xeTruc",
    "tone": "note",
    "fen": "rnbakabr1/9/1c4nc1/p1p1p3p/6p2/9/P1P1P1P1P/1C2C1N2/9/RNBAKABR1 w",
    "move": "h0h6",
    "moveNotation": "X2.6",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "i9h9",
      "i0h0",
      "g6g5"
    ],
    "game": {
      "id": 3026,
      "red": "广东 李鸿嘉",
      "black": "北京 蒋川",
      "tournament": "",
      "date": "",
      "ply": 7
    }
  },
  {
    "book": "opening",
    "lesson": 4,
    "tactic": "xeHoanh",
    "tone": "note",
    "fen": "r1bakabr1/9/1cn3nc1/p3p2Rp/2p3p2/9/P1P1P1P1P/1CN1C1N2/9/R1BAKAB2 w",
    "move": "a0a1",
    "moveNotation": "X9.1",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "i9h9",
      "i0h0",
      "g6g5",
      "h0h6",
      "b9c7",
      "b0c2",
      "c6c5"
    ],
    "game": {
      "id": 3026,
      "red": "广东 李鸿嘉",
      "black": "北京 蒋川",
      "tournament": "",
      "date": "",
      "ply": 11
    }
  },
  {
    "book": "opening",
    "lesson": 5,
    "tactic": "xeTruc",
    "tone": "note",
    "fen": "r1bakabr1/9/1cn3nc1/p1p1p3p/6p2/2P6/P3P1P1P/1CN1C1N2/9/R1BAKAB1R w",
    "move": "i0h0",
    "moveNotation": "X1-2",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "b9c7",
      "c3c4",
      "g6g5",
      "b0c2",
      "i9h9"
    ],
    "game": {
      "id": 331,
      "red": "吉林 栾枫",
      "black": "上海 谢靖",
      "tournament": "",
      "date": "",
      "ply": 9
    }
  },
  {
    "book": "opening",
    "lesson": 6,
    "tactic": "xeHoanh",
    "tone": "note",
    "fen": "r1bakabr1/9/2n3n2/p1p1p3p/6p2/2P1P4/Pc4PcP/1CN1C1N2/9/R1BAKABR1 w",
    "move": "a0a1",
    "moveNotation": "X9.1",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "b9c7",
      "c3c4",
      "g6g5",
      "b0c2",
      "i9h9",
      "i0h0",
      "b7b3",
      "e3e4",
      "h7h3"
    ],
    "game": {
      "id": 331,
      "red": "吉林 栾枫",
      "black": "上海 谢靖",
      "tournament": "",
      "date": "",
      "ply": 13
    }
  },
  {
    "book": "opening",
    "lesson": 7,
    "tactic": "xeTruc",
    "tone": "note",
    "fen": "1rbaka1nr/9/1cn1b1c2/p3p1p1p/2p6/6P2/P1P1P3P/2N1C2C1/4A4/1RBAK1BNR w",
    "move": "b0b6",
    "moveNotation": "X8.6",
    "historyMoves": [
      "g3g4",
      "h7g7",
      "b2e2",
      "g9e7",
      "f0e1",
      "c6c5",
      "b0c2",
      "b9c7",
      "a0b0",
      "a9b9"
    ],
    "game": {
      "id": 716,
      "red": "吉林 陶汉明",
      "black": "上海 孙勇征",
      "tournament": "",
      "date": "",
      "ply": 11
    }
  },
  {
    "book": "opening",
    "lesson": 8,
    "tactic": "xeHoanh",
    "tone": "note",
    "fen": "r2akabr1/9/1cn1b2c1/p1p1p3p/6pn1/1CPN5/P3P1P1P/4C1N2/9/R1BAKAB1R w",
    "move": "a0a1",
    "moveNotation": "X9.1",
    "historyMoves": [
      "c3c4",
      "h9g7",
      "b0c2",
      "g6g5",
      "h2e2",
      "b9c7",
      "h0g2",
      "i9h9",
      "b2b4",
      "g7h5",
      "c2d4",
      "c9e7"
    ],
    "game": {
      "id": 1346,
      "red": "深圳 金波",
      "black": "上海 胡荣华",
      "tournament": "",
      "date": "",
      "ply": 13
    }
  },
  {
    "book": "opening",
    "lesson": 9,
    "tactic": "xeTruc",
    "tone": "note",
    "fen": "rn1akab1r/9/1c2b1nc1/p1p1p3p/6p2/9/P1P1P1P1P/1C2B1C1N/9/RN1AKAB1R w",
    "move": "i0h0",
    "moveNotation": "X1-2",
    "historyMoves": [
      "c0e2",
      "g6g5",
      "h2g2",
      "c9e7",
      "h0i2",
      "h9g7"
    ],
    "game": {
      "id": 386,
      "red": "湖北 李雪松",
      "black": "南方棋院 李鸿嘉",
      "tournament": "",
      "date": "",
      "ply": 7
    }
  },
  {
    "book": "opening",
    "lesson": 10,
    "tactic": "xeHoanh",
    "tone": "note",
    "fen": "r1bakabr1/9/6n2/p3p1N1p/2pn5/1c4P2/P1P1c3P/1CN1B1C2/4A4/R1BAK3R w",
    "move": "a0a1",
    "moveNotation": "X9.1",
    "historyMoves": [
      "g0e2",
      "b9c7",
      "g3g4",
      "c6c5",
      "h0g2",
      "c7d5",
      "f0e1",
      "h7e7",
      "b0c2",
      "h9g7",
      "g2h4",
      "b7b4",
      "h4g6",
      "i9h9",
      "h2g2",
      "e7e3"
    ],
    "game": {
      "id": 496,
      "red": "黑龙江 赵国荣",
      "black": "广东 许银川",
      "tournament": "",
      "date": "",
      "ply": 17
    }
  },
  {
    "book": "opening",
    "lesson": 11,
    "tactic": "daiXuatXe",
    "tone": "praise",
    "fen": "2bakac1r/2c6/n3bRn2/N3p3p/6p2/2P6/P3P1P1P/2C1B2CN/3r5/2BAKA2R b",
    "move": "i9i7",
    "moveNotation": "X9.2",
    "historyMoves": [
      "c3c4",
      "h9g7",
      "b0c2",
      "g6g5",
      "a0a1",
      "g9e7",
      "g0e2",
      "h7h9",
      "c2d4",
      "b9a7",
      "d4c6",
      "a9a8",
      "a1f1",
      "h9g9",
      "h0i2",
      "b7c7",
      "c6b4",
      "a8d8",
      "b4a6",
      "c7c8",
      "f1f7",
      "d8d1",
      "b2c2"
    ],
    "game": {
      "id": 5446,
      "red": "江苏 程鸣",
      "black": "广东 吕钦",
      "tournament": "",
      "date": "",
      "ply": 24
    }
  },
  {
    "book": "opening",
    "lesson": 12,
    "tactic": "xeTamThat",
    "tone": "note",
    "fen": "2bakabr1/9/2nR2n2/p1p1p3p/6p2/2PNP4/P5PcP/Br2CcN2/9/3AKABR1 w",
    "move": "d7g7",
    "moveNotation": "X6-3",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "b9c7",
      "c3c4",
      "g6g5",
      "b0c2",
      "i9h9",
      "i0h0",
      "b7b3",
      "e3e4",
      "h7h3",
      "a0a1",
      "b3c3",
      "c0a2",
      "a9b9",
      "a1d1",
      "c3f3",
      "d1d7",
      "f3f2",
      "c2d4",
      "b9b2"
    ],
    "game": {
      "id": 331,
      "red": "吉林 栾枫",
      "black": "上海 谢靖",
      "tournament": "",
      "date": "",
      "ply": 23
    }
  },
  {
    "book": "opening",
    "lesson": 16,
    "tactic": "taPhaoPhongXe",
    "tone": "praise",
    "fen": "r1bakabr1/9/1cn3nc1/p1p1p3p/6p2/2P6/P3P1P1P/1CN1C1N2/9/R1BAKABR1 b",
    "move": "b7b3",
    "moveNotation": "P2.4",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "b9c7",
      "c3c4",
      "g6g5",
      "b0c2",
      "i9h9",
      "i0h0"
    ],
    "game": {
      "id": 331,
      "red": "吉林 栾枫",
      "black": "上海 谢靖",
      "tournament": "",
      "date": "",
      "ply": 10
    }
  },
  {
    "book": "opening",
    "lesson": 17,
    "tactic": "phaoDoiMaKhaiCuoc",
    "tone": "critique",
    "fen": "2bak2r1/1R2a4/c3b1nc1/4p1p1p/1np6/r5PR1/2P1P3P/N1C1C1N2/9/2BAKAB2 b",
    "move": "a7a2",
    "moveNotation": "P1.5",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "g3g4",
      "c6c5",
      "h0g2",
      "i9h9",
      "i0h0",
      "b9c7",
      "b0a2",
      "a6a5",
      "b2c2",
      "c7b5",
      "a0a1",
      "g9e7",
      "a1d1",
      "a5a4",
      "a3a4",
      "a9a4",
      "h0h4",
      "b7a7",
      "d1d8",
      "f9e8",
      "d8b8"
    ],
    "game": {
      "id": 10506,
      "red": "北京 臧如意",
      "black": "南方棋院 陈富杰",
      "tournament": "",
      "date": "",
      "ply": 24
    }
  },
  {
    "book": "opening",
    "lesson": 18,
    "tactic": "maPhongXe",
    "tone": "note",
    "fen": "1rbaka1r1/9/2n1b1c2/p1C1p3p/1cp2n3/1R4R2/P1P1P3P/2N1C1N2/9/2BAKAB2 w",
    "move": "g2h4",
    "moveNotation": "M3.2",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "g3g4",
      "i9h9",
      "h0g2",
      "c6c5",
      "b2b6",
      "b9c7",
      "b6c6",
      "g9e7",
      "b0c2",
      "b7b5",
      "a0b0",
      "a9b9",
      "i0h0",
      "g6g5",
      "h0h4",
      "g5g4",
      "h4g4",
      "g7f5",
      "b0b4",
      "h7g7"
    ],
    "game": {
      "id": 5391,
      "red": "厦门港务集团 陈富杰",
      "black": "广东 许银川",
      "tournament": "",
      "date": "",
      "ply": 23
    }
  },
  {
    "book": "opening",
    "lesson": 21,
    "tactic": "songChinhMa",
    "tone": "note",
    "fen": "rnbakab1r/9/1c4nc1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKAB1R b",
    "move": "b9c7",
    "moveNotation": "M2.3",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2"
    ],
    "game": {
      "id": 331,
      "red": "吉林 栾枫",
      "black": "上海 谢靖",
      "tournament": "",
      "date": "",
      "ply": 4
    }
  },
  {
    "book": "opening",
    "lesson": 22,
    "tactic": "chinhMaBienMa",
    "tone": "note",
    "fen": "rn1akabr1/9/1c2b1nc1/p1p1p3p/6p2/9/P1P1P1P1P/1C2B1C1N/9/RN1AKABR1 w",
    "move": "b0c2",
    "moveNotation": "M8.7",
    "historyMoves": [
      "c0e2",
      "g6g5",
      "h2g2",
      "c9e7",
      "h0i2",
      "h9g7",
      "i0h0",
      "i9h9"
    ],
    "game": {
      "id": 386,
      "red": "湖北 李雪松",
      "black": "南方棋院 李鸿嘉",
      "tournament": "",
      "date": "",
      "ply": 9
    }
  },
  {
    "book": "opening",
    "lesson": 24,
    "tactic": "maQuaiCuoc",
    "tone": "note",
    "fen": "1rbaka1r1/5n3/2c1b1c2/p3p1p1p/9/5RP2/P1P1P3P/2N1CC3/4A4/2BAK1B1R b",
    "move": "f8d7",
    "moveNotation": "M6.4",
    "historyMoves": [
      "g3g4",
      "h7g7",
      "b2e2",
      "g9e7",
      "f0e1",
      "c6c5",
      "b0c2",
      "b9c7",
      "a0b0",
      "a9b9",
      "b0b6",
      "h9f8",
      "h2f2",
      "i9h9",
      "h0g2",
      "c7d5",
      "b6b4",
      "c5c4",
      "b4c4",
      "b7c7",
      "g2f4",
      "d5f4",
      "c4f4"
    ],
    "game": {
      "id": 716,
      "red": "吉林 陶汉明",
      "black": "上海 孙勇征",
      "tournament": "",
      "date": "",
      "ply": 24
    }
  },
  {
    "book": "opening",
    "lesson": 25,
    "tactic": "caiMaTamChuy",
    "tone": "praise",
    "fen": "r2akab1r/9/2n1c1n2/p1p1p3p/2b3p2/9/Pc2P1P1P/N1C1C1N2/9/R1BAKABR1 w",
    "move": "a2c3",
    "moveNotation": "M9.7",
    "historyMoves": [
      "h2e2",
      "h7e7",
      "h0g2",
      "h9g7",
      "i0h0",
      "g6g5",
      "b0a2",
      "b9c7",
      "b2c2",
      "b7b3",
      "c3c4",
      "c9a7",
      "c4c5",
      "a7c5"
    ],
    "game": {
      "id": 7261,
      "red": "黑龙江 赵国荣",
      "black": "河南 颜成龙",
      "tournament": "",
      "date": "",
      "ply": 15
    }
  },
  {
    "book": "opening",
    "lesson": 26,
    "tactic": "maBanHa",
    "tone": "note",
    "fen": "1rbakabr1/9/2nR2n2/p1p1p3p/6p2/2P1P4/P5PcP/BCN1CcN2/9/3AKABR1 w",
    "move": "c2d4",
    "moveNotation": "M7.6",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "b9c7",
      "c3c4",
      "g6g5",
      "b0c2",
      "i9h9",
      "i0h0",
      "b7b3",
      "e3e4",
      "h7h3",
      "a0a1",
      "b3c3",
      "c0a2",
      "a9b9",
      "a1d1",
      "c3f3",
      "d1d7",
      "f3f2"
    ],
    "game": {
      "id": 331,
      "red": "吉林 栾枫",
      "black": "上海 谢靖",
      "tournament": "",
      "date": "",
      "ply": 21
    }
  },
  {
    "book": "opening",
    "lesson": 27,
    "tactic": "xeDeMa",
    "tone": "praise",
    "fen": "1r1akabr1/9/2n1b2c1/p1p1p3p/5n3/6R2/PcP1P3P/N1C1C1N2/9/1RBAKAB2 w",
    "move": "g4f4",
    "moveNotation": "X3-4",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "i9h9",
      "i0h0",
      "b9c7",
      "b0a2",
      "g6g5",
      "b2c2",
      "a9b9",
      "a0b0",
      "b7b3",
      "h0h4",
      "c9e7",
      "g3g4",
      "g5g4",
      "h4g4",
      "g7f5"
    ],
    "game": {
      "id": 2230,
      "red": "四川 李艾东",
      "black": "沈阳 金波",
      "tournament": "",
      "date": "",
      "ply": 19
    }
  },
  {
    "book": "opening",
    "lesson": 28,
    "tactic": "maDonDocTienSau",
    "tone": "critique",
    "fen": "1r2kabr1/4a4/n1c1b1n1c/p1p1p1p1p/9/2PN2P2/P3P3P/3CC1N2/4A4/R1B1KAB1R w",
    "move": "d4e6",
    "moveNotation": "M6.5",
    "historyMoves": [
      "c3c4",
      "b7c7",
      "h2e2",
      "c9e7",
      "d0e1",
      "h9g7",
      "h0g2",
      "i9h9",
      "g3g4",
      "h7i7",
      "b2d2",
      "b9a7",
      "b0c2",
      "a9b9",
      "c2d4",
      "d9e8"
    ],
    "game": {
      "id": 8141,
      "red": "广东 吕钦",
      "black": "浙江 于幼华",
      "tournament": "",
      "date": "",
      "ply": 17
    }
  },
  {
    "book": "opening",
    "lesson": 29,
    "tactic": "nguLucPhao",
    "tone": "note",
    "fen": "1rbaka2r/5n3/1cn1b1c2/pR2p1p1p/2p6/6P2/P1P1P3P/2N1C2C1/4A4/2BAK1BNR w",
    "move": "h2f2",
    "moveNotation": "P2-4",
    "historyMoves": [
      "g3g4",
      "h7g7",
      "b2e2",
      "g9e7",
      "f0e1",
      "c6c5",
      "b0c2",
      "b9c7",
      "a0b0",
      "a9b9",
      "b0b6",
      "h9f8"
    ],
    "game": {
      "id": 716,
      "red": "吉林 陶汉明",
      "black": "上海 孙勇征",
      "tournament": "",
      "date": "",
      "ply": 13
    }
  },
  {
    "book": "opening",
    "lesson": 30,
    "tactic": "nguThatPhao",
    "tone": "note",
    "fen": "r1bakabr1/9/6n2/p3p1N1p/2p6/1c1Rc1P2/P1n5P/1CN1B1C2/4A4/2BAK3R b",
    "move": "b4c4",
    "moveNotation": "P2-3",
    "historyMoves": [
      "g0e2",
      "b9c7",
      "g3g4",
      "c6c5",
      "h0g2",
      "c7d5",
      "f0e1",
      "h7e7",
      "b0c2",
      "h9g7",
      "g2h4",
      "b7b4",
      "h4g6",
      "i9h9",
      "h2g2",
      "e7e3",
      "a0a1",
      "e3e4",
      "a1d1",
      "d5c3",
      "d1d4"
    ],
    "game": {
      "id": 496,
      "red": "黑龙江 赵国荣",
      "black": "广东 许银川",
      "tournament": "",
      "date": "",
      "ply": 22
    }
  },
  {
    "book": "opening",
    "lesson": 31,
    "tactic": "nguBatPhao",
    "tone": "praise",
    "fen": "r1bakab2/9/1cn1c1n2/p1pRp1p1p/7r1/9/P1P1P1P1P/1CN1C1N2/9/R1BAKAB2 b",
    "move": "b7b5",
    "moveNotation": "P2.2",
    "historyMoves": [
      "h2e2",
      "h7e7",
      "h0g2",
      "h9g7",
      "i0i1",
      "i9h9",
      "i1d1",
      "h9h5",
      "b0c2",
      "b9c7",
      "d1d6"
    ],
    "game": {
      "id": 771,
      "red": "江苏 徐天红",
      "black": "广东 许银川",
      "tournament": "",
      "date": "",
      "ply": 12
    }
  },
  {
    "book": "opening",
    "lesson": 32,
    "tactic": "nguCuuPhao",
    "tone": "note",
    "fen": "1r1akab2/9/2n1b1n2/p1C1p3p/6p1c/2P1P4/Pc4P1P/4C1N2/2N6/1RBAKAB2 b",
    "move": "b3e3",
    "moveNotation": "P2-5",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "b9c7",
      "i0h0",
      "i9h9",
      "c3c4",
      "g6g5",
      "b0a2",
      "b7b3",
      "e3e4",
      "c9e7",
      "b2c2",
      "h7h5",
      "a0b0",
      "a9b9",
      "h0h4",
      "h5i5",
      "h4h9",
      "g7h9",
      "c2c6",
      "h9g7",
      "a2c1"
    ],
    "game": {
      "id": 3961,
      "red": "湖北 柳大华",
      "black": "江苏 王斌",
      "tournament": "",
      "date": "",
      "ply": 24
    }
  },
  {
    "book": "opening",
    "lesson": 33,
    "tactic": "tuanHaPhao",
    "tone": "note",
    "fen": "rn1akabr1/9/3cb1n2/p1p1p3p/6p2/8P/P1P1P1Pc1/1CN1B1C1N/9/R2AKABR1 w",
    "move": "b2b4",
    "moveNotation": "P8.2",
    "historyMoves": [
      "c0e2",
      "g6g5",
      "h2g2",
      "c9e7",
      "h0i2",
      "h9g7",
      "i0h0",
      "i9h9",
      "b0c2",
      "h7h3",
      "i3i4",
      "b7d7"
    ],
    "game": {
      "id": 386,
      "red": "湖北 李雪松",
      "black": "南方棋院 李鸿嘉",
      "tournament": "",
      "date": "",
      "ply": 13
    }
  },
  {
    "book": "opening",
    "lesson": 35,
    "tactic": "phaoDoiPhao",
    "tone": "note",
    "fen": "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR b",
    "move": "h7e7",
    "moveNotation": "P8-5",
    "historyMoves": [
      "h2e2"
    ],
    "game": {
      "id": 771,
      "red": "江苏 徐天红",
      "black": "广东 许银川",
      "tournament": "",
      "date": "",
      "ply": 2
    }
  },
  {
    "book": "opening",
    "lesson": 37,
    "tactic": "siGiacPhao",
    "tone": "note",
    "fen": "r1bakabnr/9/1cn4c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKAB1R b",
    "move": "h7f7",
    "moveNotation": "P8-6",
    "historyMoves": [
      "h2e2",
      "b9c7",
      "h0g2"
    ],
    "game": {
      "id": 606,
      "red": "火车头 金波",
      "black": "上海浦东 董旭彬",
      "tournament": "",
      "date": "",
      "ply": 4
    }
  },
  {
    "book": "opening",
    "lesson": 38,
    "tactic": "songBienPhao",
    "tone": "note",
    "fen": "r3kabn1/4a4/1cn5c/p3p3C/2b3p2/9/P3P1P1P/N3C1N2/9/1RBAKAB2 b",
    "move": "b7a7",
    "moveNotation": "P2-1",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "i9h9",
      "i0h0",
      "b9c7",
      "b0a2",
      "c6c5",
      "h0h4",
      "c9e7",
      "c3c4",
      "d9e8",
      "c4c5",
      "e7c5",
      "b2b6",
      "g6g5",
      "b6i6",
      "h7i7",
      "h4h9",
      "g7h9",
      "a0b0"
    ],
    "game": {
      "id": 8801,
      "red": "江苏 徐天红",
      "black": "火车头 傅光明",
      "tournament": "",
      "date": "",
      "ply": 22
    }
  },
  {
    "book": "opening",
    "lesson": 41,
    "tactic": "songPhaoQuaHa",
    "tone": "praise",
    "fen": "r1bakabr1/9/4c1n2/p3p1N1p/2pn5/1c4P2/P1P1P3P/1CN1B1C2/4A4/R1BAK3R b",
    "move": "e7e3",
    "moveNotation": "P5.4",
    "historyMoves": [
      "g0e2",
      "b9c7",
      "g3g4",
      "c6c5",
      "h0g2",
      "c7d5",
      "f0e1",
      "h7e7",
      "b0c2",
      "h9g7",
      "g2h4",
      "b7b4",
      "h4g6",
      "i9h9",
      "h2g2"
    ],
    "game": {
      "id": 496,
      "red": "黑龙江 赵国荣",
      "black": "广东 许银川",
      "tournament": "",
      "date": "",
      "ply": 16
    }
  },
  {
    "book": "opening",
    "lesson": 42,
    "tactic": "luongDauXa",
    "tone": "praise",
    "fen": "r3kabn1/4a4/2n1b3c/p1p1C3p/6p2/2c1P4/P5P1P/N3C1N2/9/1RBAKAB2 b",
    "move": "c6c5",
    "moveNotation": "B3.1",
    "historyMoves": [
      "c3c4",
      "b7c7",
      "h2e2",
      "c9e7",
      "b0a2",
      "g6g5",
      "h0g2",
      "h9g7",
      "i0h0",
      "i9h9",
      "h0h4",
      "h7i7",
      "h4h9",
      "g7h9",
      "e2e6",
      "d9e8",
      "b2e2",
      "c7c4",
      "a0b0",
      "b9c7",
      "e3e4"
    ],
    "game": {
      "id": 1101,
      "red": "广东 吕钦",
      "black": "江苏 徐天红",
      "tournament": "",
      "date": "",
      "ply": 22
    }
  },
  {
    "book": "opening",
    "lesson": 43,
    "tactic": "tamBoHo",
    "tone": "note",
    "fen": "rn1akabr1/9/2c1b1nc1/p1p1p3p/6p2/2P4R1/P3P1P1P/NC2C1N2/9/R1BAKAB2 b",
    "move": "h7i7",
    "moveNotation": "P8-9",
    "historyMoves": [
      "c3c4",
      "b7c7",
      "h2e2",
      "c9e7",
      "b0a2",
      "g6g5",
      "h0g2",
      "h9g7",
      "i0h0",
      "i9h9",
      "h0h4"
    ],
    "game": {
      "id": 1101,
      "red": "广东 吕钦",
      "black": "江苏 徐天红",
      "tournament": "",
      "date": "",
      "ply": 12
    }
  },
  {
    "book": "opening",
    "lesson": 45,
    "tactic": "phiTuongTanTrungBinh",
    "tone": "praise",
    "fen": "r3kab2/1c2a4/2n1b1n1c/2p1p2rp/p5p2/1CPN5/P3P1P1P/3CB1N2/R4R3/2BAKA3 b",
    "move": "e6e5",
    "moveNotation": "B5.1",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "i9h9",
      "c3c4",
      "g6g5",
      "b0c2",
      "b9c7",
      "c2d4",
      "h7i7",
      "i0i1",
      "d9e8",
      "b2b4",
      "c9e7",
      "e2d2",
      "h9h6",
      "a0a1",
      "a6a5",
      "g0e2",
      "b7b8",
      "i1f1"
    ],
    "game": {
      "id": 2256,
      "red": "上海 万春林",
      "black": "湖北 李雪松",
      "tournament": "",
      "date": "",
      "ply": 22
    }
  },
  {
    "book": "opening",
    "lesson": 46,
    "tactic": "tuongBien",
    "tone": "critique",
    "fen": "r2akab2/4n3c/1c2b1n2/p1p1p3p/3R5/2P3P2/P3P1r1P/3CC1N2/9/RNBAKAB2 w",
    "move": "g0i2",
    "moveNotation": "T3.1",
    "historyMoves": [
      "h2e2",
      "h9g7",
      "h0g2",
      "i9h9",
      "i0h0",
      "b9c7",
      "c3c4",
      "g6g5",
      "h0h6",
      "h7i7",
      "h6g6",
      "i7i8",
      "b2d2",
      "c7e8",
      "g6g5",
      "c9e7",
      "g5d5",
      "h9h3",
      "g3g4",
      "h3g3"
    ],
    "game": {
      "id": 1431,
      "red": "湖南 谭文才",
      "black": "黑龙江 聂铁文",
      "tournament": "",
      "date": "",
      "ply": 21
    }
  },
  {
    "book": "middlegame",
    "lesson": 1,
    "tactic": "khuyetSiSongXe",
    "tone": "praise",
    "fen": "2bakc3/3R2R2/2n1b3c/2p1r3p/p3C1p2/2P1P4/P5P1P/1r2B1N2/4A4/4KAB2 w",
    "move": "g8g7",
    "moveNotation": "X3/1",
    "game": {
      "id": 1,
      "red": "农民体协 毕彬彬",
      "black": "广东 文静",
      "tournament": "",
      "date": "",
      "ply": 47
    }
  },
  {
    "book": "middlegame",
    "lesson": 1,
    "tactic": "khuyetSiSongXe",
    "tone": "praise",
    "fen": "6R2/4an1R1/4k4/3c1r2p/p3p1b2/2P3N2/P2r4P/4B4/4A4/2BAK4 w",
    "move": "g9g7",
    "moveNotation": "X3/2",
    "game": {
      "id": 2234,
      "red": "火车头 宋国强",
      "black": "江苏 赵剑",
      "tournament": "",
      "date": "",
      "ply": 77
    }
  },
  {
    "book": "middlegame",
    "lesson": 2,
    "tactic": "muonCungSat",
    "tone": "praise",
    "fen": "4kab2/4a1c2/4b1n2/pN2p3p/9/P1B5P/4P4/4C4/c2CA4/4KAB2 b",
    "move": "g8g0",
    "moveNotation": "P7.8",
    "game": {
      "id": 8361,
      "red": "上海 胡荣华",
      "black": "湖北 柳大华",
      "tournament": "",
      "date": "",
      "ply": 62
    }
  },
  {
    "book": "middlegame",
    "lesson": 3,
    "tactic": "ngoaTaoMa",
    "tone": "praise",
    "fen": "3akabn1/9/4b4/2p1rN2p/5c3/R8/P7P/4C4/9/2BAKAB2 w",
    "move": "f6g8",
    "moveNotation": "M4.3",
    "game": {
      "id": 6601,
      "red": "湖北 李雪松",
      "black": "河北 孙庆利",
      "tournament": "",
      "date": "",
      "ply": 43
    }
  },
  {
    "book": "middlegame",
    "lesson": 3,
    "tactic": "ngoaTaoMa",
    "tone": "praise",
    "fen": "2baka3/9/4b1n2/CN2p4/Pc3n2p/2P6/4P1p1P/4B4/4A4/2BAK4 w",
    "move": "b6c8",
    "moveNotation": "M8.7",
    "game": {
      "id": 10616,
      "red": "广东 许银川",
      "black": "北京 苗永鹏",
      "tournament": "",
      "date": "",
      "ply": 61
    }
  },
  {
    "book": "middlegame",
    "lesson": 3,
    "tactic": "ngoaTaoMa",
    "tone": "praise",
    "fen": "2b2R3/4k4/4b4/3P4p/p2N5/4P4/8P/4n1r2/c4K3/3A1AB2 b",
    "move": "e2c1",
    "moveNotation": "M5.3",
    "game": {
      "id": 276,
      "red": "江苏 张国凤",
      "black": "云南 赵冠芳",
      "tournament": "",
      "date": "",
      "ply": 94
    }
  },
  {
    "book": "middlegame",
    "lesson": 5,
    "tactic": "chuyenHoaTanCuoc",
    "tone": "praise",
    "fen": "3ak1b2/4aC3/2n1b3n/p1p1p4/6r2/2P3RN1/P1c1P1P2/7C1/4A4/2BAK1B2 w",
    "move": "g4g5",
    "moveNotation": "X3.1",
    "game": {
      "id": 7041,
      "red": "厦门港务控股 郑一泓",
      "black": "浙江球冠 张申宏",
      "tournament": "",
      "date": "",
      "ply": 49
    }
  },
  {
    "book": "middlegame",
    "lesson": 5,
    "tactic": "chuyenHoaTanCuoc",
    "tone": "praise",
    "fen": "4kab2/4a4/4bc3/1rN5p/5n3/1c2P4/P2R4P/B1C1C4/9/3AKAB2 w",
    "move": "c6b4",
    "moveNotation": "M7/8",
    "game": {
      "id": 7151,
      "red": "上海金外滩 孙勇征",
      "black": "金环钢构 刘殿中",
      "tournament": "",
      "date": "",
      "ply": 57
    }
  },
  {
    "book": "middlegame",
    "lesson": 5,
    "tactic": "chuyenHoaTanCuoc",
    "tone": "praise",
    "fen": "2cak1b2/4a4/2R1b4/2C5p/p1n2R3/9/P1n5P/3Ar4/4A4/5K3 b",
    "move": "c9c6",
    "moveNotation": "P3.3",
    "game": {
      "id": 532,
      "red": "杭州 陈建国",
      "black": "河北 苗利明",
      "tournament": "",
      "date": "",
      "ply": 156
    }
  },
  {
    "book": "middlegame",
    "lesson": 6,
    "tactic": "chanDuong",
    "tone": "praise",
    "fen": "4kab2/4a4/4b1c2/2R1n1n2/1r7/1N4P1C/P1C1P3P/4B1N2/4A4/c3KAB2 b",
    "move": "g6h4",
    "moveNotation": "M7.8",
    "game": {
      "id": 1211,
      "red": "山东 谢岿",
      "black": "江苏 徐天红",
      "tournament": "",
      "date": "",
      "ply": 54
    }
  },
  {
    "book": "middlegame",
    "lesson": 6,
    "tactic": "chanDuong",
    "tone": "praise",
    "fen": "4k1b2/4a4/2n1ba3/p1N1p1c2/1r3np1p/P1P2R1N1/4P3P/3CB4/4A4/2BAK4 b",
    "move": "g5g4",
    "moveNotation": "B7.1",
    "game": {
      "id": 1346,
      "red": "深圳 金波",
      "black": "上海 胡荣华",
      "tournament": "",
      "date": "",
      "ply": 52
    }
  },
  {
    "book": "middlegame",
    "lesson": 6,
    "tactic": "chanDuong",
    "tone": "praise",
    "fen": "4kabn1/4a3C/4bc3/6R2/6p2/6P1P/4Pr2N/4B4/4A4/2BAK4 b",
    "move": "h9i7",
    "moveNotation": "M8.9",
    "game": {
      "id": 2382,
      "red": "安徽 钟涛",
      "black": "厦门 郭福人",
      "tournament": "",
      "date": "",
      "ply": 62
    }
  },
  {
    "book": "middlegame",
    "lesson": 8,
    "tactic": "tranhNuoc",
    "tone": "praise",
    "fen": "R4ab2/3k2C2/4ba3/9/9/7C1/9/4BN3/c3A4/cr1AK1B2 w",
    "move": "h4h8",
    "moveNotation": "P2.4",
    "game": {
      "id": 386,
      "red": "湖北 李雪松",
      "black": "南方棋院 李鸿嘉",
      "tournament": "",
      "date": "",
      "ply": 95
    }
  },
  {
    "book": "middlegame",
    "lesson": 8,
    "tactic": "tranhNuoc",
    "tone": "praise",
    "fen": "9/1r3k3/9/8p/6R2/4cr3/P2R4P/4B4/1n2A4/2B1KA3 w",
    "move": "g5g8",
    "moveNotation": "X3.3",
    "game": {
      "id": 496,
      "red": "黑龙江 赵国荣",
      "black": "广东 许银川",
      "tournament": "",
      "date": "",
      "ply": 95
    }
  },
  {
    "book": "middlegame",
    "lesson": 10,
    "tactic": "nhatMaHoanLuongTuong",
    "tone": "praise",
    "fen": "2baka3/9/n1R1b1nr1/p3p3p/2PN1r3/6p2/P3P1c1P/4C1N1B/9/2BAKA2R w",
    "move": "d5e7",
    "moveNotation": "M6.5",
    "game": {
      "id": 1087,
      "red": "浙江 张辉",
      "black": "广州 张剑明",
      "tournament": "",
      "date": "",
      "ply": 35
    }
  },
  {
    "book": "middlegame",
    "lesson": 10,
    "tactic": "nhatMaHoanLuongTuong",
    "tone": "praise",
    "fen": "3akab2/9/8b/8p/p4Cr2/1NRn1n1N1/P6cP/4B4/4A4/4KAB2 b",
    "move": "f4e2",
    "moveNotation": "M6.5",
    "game": {
      "id": 1642,
      "red": "广东 黄海林",
      "black": "河北 苗利明",
      "tournament": "",
      "date": "",
      "ply": 58
    }
  },
  {
    "book": "middlegame",
    "lesson": 11,
    "tactic": "doatTrungBinh",
    "tone": "praise",
    "fen": "3R5/1r2k2r1/9/8p/4p1R2/4c4/P1n5P/4B4/4A4/2BK1A3 w",
    "move": "g5e5",
    "moveNotation": "X3-5",
    "game": {
      "id": 496,
      "red": "黑龙江 赵国荣",
      "black": "广东 许银川",
      "tournament": "",
      "date": "",
      "ply": 87
    }
  },
  {
    "book": "middlegame",
    "lesson": 11,
    "tactic": "doatTrungBinh",
    "tone": "praise",
    "fen": "1nb1kab2/4a4/8c/p1p1p3p/4c1P2/2P1C4/P3N3P/4C4/2r6/2BAKAB1R w",
    "move": "e4e6",
    "moveNotation": "Pt.2",
    "game": {
      "id": 7096,
      "red": "江苏金陵人酒店队 徐天红",
      "black": "河北金环钢构 张江",
      "tournament": "",
      "date": "",
      "ply": 31
    }
  },
  {
    "book": "middlegame",
    "lesson": 11,
    "tactic": "doatTrungBinh",
    "tone": "praise",
    "fen": "1r1akab2/n8/4b1C2/p1p1p2Rp/6p2/9/Pc2P1P1P/4C1r2/9/1RBAKAB2 w",
    "move": "e2e6",
    "moveNotation": "P5.4",
    "game": {
      "id": 7261,
      "red": "黑龙江 赵国荣",
      "black": "河南 颜成龙",
      "tournament": "",
      "date": "",
      "ply": 31
    }
  },
  {
    "book": "middlegame",
    "lesson": 13,
    "tactic": "phaoTramDay",
    "tone": "praise",
    "fen": "4ka3/4a4/9/p2R4p/1c4pr1/4P4/P5P1P/4C4/4N4/r2AKAB2 b",
    "move": "b5b0",
    "moveNotation": "P2.5",
    "game": {
      "id": 4566,
      "red": "广东王老吉 吕钦",
      "black": "浙江 于幼华",
      "tournament": "",
      "date": "",
      "ply": 60
    }
  },
  {
    "book": "middlegame",
    "lesson": 13,
    "tactic": "phaoTramDay",
    "tone": "praise",
    "fen": "1R1rka3/4a4/4bc3/8p/5n3/9/P7P/B3C4/2C6/3AKAB2 w",
    "move": "c1c9",
    "moveNotation": "P7.8",
    "game": {
      "id": 7151,
      "red": "上海金外滩 孙勇征",
      "black": "金环钢构 刘殿中",
      "tournament": "",
      "date": "",
      "ply": 71
    }
  },
  {
    "book": "middlegame",
    "lesson": 13,
    "tactic": "phaoTramDay",
    "tone": "praise",
    "fen": "2nk1a3/2R1a4/4b4/pr2r3p/6p2/P7P/4P1PC1/1c2B4/4A4/1R2KAB2 w",
    "move": "h3h9",
    "moveNotation": "P2.6",
    "game": {
      "id": 7261,
      "red": "黑龙江 赵国荣",
      "black": "河南 颜成龙",
      "tournament": "",
      "date": "",
      "ply": 55
    }
  },
  {
    "book": "middlegame",
    "lesson": 14,
    "tactic": "thienDiaPhao",
    "tone": "praise",
    "fen": "1R1rka3/4a4/4bc3/8p/5n3/9/P7P/B3C4/2C6/3AKAB2 w",
    "move": "c1c9",
    "moveNotation": "P7.8",
    "game": {
      "id": 7151,
      "red": "上海金外滩 孙勇征",
      "black": "金环钢构 刘殿中",
      "tournament": "",
      "date": "",
      "ply": 71
    }
  },
  {
    "book": "middlegame",
    "lesson": 14,
    "tactic": "thienDiaPhao",
    "tone": "praise",
    "fen": "4kab2/4a4/2P1b3n/p3N1p2/9/9/P2c1n2P/N1C1B1C2/8R/2BAKA1rc b",
    "move": "d3e3",
    "moveNotation": "P4-5",
    "game": {
      "id": 56,
      "red": "火车头 韩冰",
      "black": "四川 章文彤",
      "tournament": "",
      "date": "",
      "ply": 58
    }
  },
  {
    "book": "middlegame",
    "lesson": 14,
    "tactic": "thienDiaPhao",
    "tone": "praise",
    "fen": "r1b1ka3/4a4/2R1b4/pC4p1p/9/2P6/P8/1R2C4/9/2BAKcr2 w",
    "move": "b6b9",
    "moveNotation": "P8.3",
    "game": {
      "id": 2806,
      "red": "浙江 王国敏",
      "black": "林业体协 赵利琴",
      "tournament": "",
      "date": "",
      "ply": 55
    }
  },
  {
    "book": "middlegame",
    "lesson": 16,
    "tactic": "oanhTacLoSuon",
    "tone": "praise",
    "fen": "2bakab2/9/6n2/p3p1p1p/2P2r3/4RnP2/P2Ccr2P/4C4/4A4/2BAK1B1R b",
    "move": "f3f0",
    "moveNotation": "Xt.3",
    "game": {
      "id": 8636,
      "red": "浙江 曾久钦",
      "black": "北京 靳玉砚",
      "tournament": "",
      "date": "",
      "ply": 36
    }
  },
  {
    "book": "middlegame",
    "lesson": 17,
    "tactic": "manhCongTuyenApDay",
    "tone": "praise",
    "fen": "9/1r3k3/9/8p/6R2/4cr3/P2R4P/4B4/1n2A4/2B1KA3 w",
    "move": "g5g8",
    "moveNotation": "X3.3",
    "game": {
      "id": 496,
      "red": "黑龙江 赵国荣",
      "black": "广东 许银川",
      "tournament": "",
      "date": "",
      "ply": 95
    }
  },
  {
    "book": "middlegame",
    "lesson": 17,
    "tactic": "manhCongTuyenApDay",
    "tone": "praise",
    "fen": "2R2abC1/3ka4/2R6/pr2r3p/6p2/P7P/4P1P2/4B4/4A4/1c2KAB2 w",
    "move": "h9h8",
    "moveNotation": "P2/1",
    "game": {
      "id": 7261,
      "red": "黑龙江 赵国荣",
      "black": "河南 颜成龙",
      "tournament": "",
      "date": "",
      "ply": 65
    }
  },
  {
    "book": "middlegame",
    "lesson": 17,
    "tactic": "manhCongTuyenApDay",
    "tone": "praise",
    "fen": "6R2/4nk3/9/p7p/3c2n2/6B2/P4p2P/9/4A4/2BAK4 w",
    "move": "g9g8",
    "moveNotation": "X3/1",
    "game": {
      "id": 551,
      "red": "上海浦东 董旭彬",
      "black": "福建 王晓华",
      "tournament": "",
      "date": "",
      "ply": 61
    }
  },
  {
    "book": "middlegame",
    "lesson": 19,
    "tactic": "chiemTuyenTot",
    "tone": "praise",
    "fen": "2bak4/4a4/4b4/2n1p3p/p8/4R3P/P3P1r2/C3B4/4A4/4KABN1 w",
    "move": "e4e6",
    "moveNotation": "X5.2",
    "game": {
      "id": 5611,
      "red": "河北金环钢构 刘殿中",
      "black": "河北金环钢构 张江",
      "tournament": "",
      "date": "",
      "ply": 69
    }
  },
  {
    "book": "middlegame",
    "lesson": 19,
    "tactic": "chiemTuyenTot",
    "tone": "praise",
    "fen": "4kab1r/4a4/N1n1b1c2/p2n4p/9/4p4/P5r1P/B3C1N2/3CA4/2RAK1BR1 w",
    "move": "c0c6",
    "moveNotation": "X7.6",
    "game": {
      "id": 8080,
      "red": "黑龙江 郭丽萍",
      "black": "河北 刚秋英",
      "tournament": "",
      "date": "",
      "ply": 45
    }
  },
  {
    "book": "middlegame",
    "lesson": 19,
    "tactic": "chiemTuyenTot",
    "tone": "praise",
    "fen": "2cakab2/9/1cn1b1n2/4p1C1p/p3r4/5NP2/P3P3P/N3BC3/6R2/2BAKA3 b",
    "move": "e5e3",
    "moveNotation": "X5.2",
    "game": {
      "id": 10341,
      "red": "地质体协 闫玉锁",
      "black": "广西 冯明光",
      "tournament": "",
      "date": "",
      "ply": 34
    }
  },
  {
    "book": "middlegame",
    "lesson": 20,
    "tactic": "khongCheKyHa",
    "tone": "praise",
    "fen": "2baka1r1/9/4b1n2/C3p3p/1n4c2/PN7/4P3P/2C2r3/R7N/2BAKA2R b",
    "move": "h9h4",
    "moveNotation": "X8.5",
    "game": {
      "id": 7747,
      "red": "重庆 洪智",
      "black": "江苏 徐天红",
      "tournament": "",
      "date": "",
      "ply": 32
    }
  },
  {
    "book": "middlegame",
    "lesson": 21,
    "tactic": "tranhDoatLo3Lo7",
    "tone": "praise",
    "fen": "4ka3/4a4/b3b4/1r7/6r2/2P6/PC3R3/9/4Ap1N1/3AK4 b",
    "move": "g5g1",
    "moveNotation": "X7.4",
    "game": {
      "id": 8450,
      "red": "江苏 徐健秒",
      "black": "武汉 王斌",
      "tournament": "",
      "date": "",
      "ply": 120
    }
  },
  {
    "book": "middlegame",
    "lesson": 21,
    "tactic": "tranhDoatLo3Lo7",
    "tone": "praise",
    "fen": "2bak4/4a4/4b4/4c2P1/6r2/9/5p3/4C3B/4A4/4KR3 b",
    "move": "g5g2",
    "moveNotation": "X7.3",
    "game": {
      "id": 865,
      "red": "澳门 李锦欢",
      "black": "沈阳 尚威",
      "tournament": "",
      "date": "",
      "ply": 102
    }
  },
  {
    "book": "middlegame",
    "lesson": 21,
    "tactic": "tranhDoatLo3Lo7",
    "tone": "praise",
    "fen": "4kab2/4ac3/1R2b4/p4N2p/6p2/4P4/P1pn2N1P/9/3r3C1/2B1KAB2 b",
    "move": "d1g1",
    "moveNotation": "X4-7",
    "game": {
      "id": 1827,
      "red": "江苏 赵剑",
      "black": "四川 谢卓淼",
      "tournament": "",
      "date": "",
      "ply": 60
    }
  },
  {
    "book": "middlegame",
    "lesson": 22,
    "tactic": "phongToaLoXe",
    "tone": "praise",
    "fen": "2bak3r/2r1a4/1c2b1nc1/p4Rp1p/2pNp2C1/6P2/n1P1P3P/N2CB4/4A4/R1BAK4 w",
    "move": "a0b0",
    "moveNotation": "X9-8",
    "game": {
      "id": 10451,
      "red": "林业体协 曾启泉",
      "black": "厦门 叶新洲",
      "tournament": "",
      "date": "",
      "ply": 23
    }
  },
  {
    "book": "middlegame",
    "lesson": 22,
    "tactic": "phongToaLoXe",
    "tone": "praise",
    "fen": "2b3br1/3kaR3/9/p3C1N1p/6p2/2P1P4/P5PcP/4K1N2/1r7/2cA1ABR1 w",
    "move": "g6h8",
    "moveNotation": "Mt.2",
    "game": {
      "id": 331,
      "red": "吉林 栾枫",
      "black": "上海 谢靖",
      "tournament": "",
      "date": "",
      "ply": 51
    }
  },
  {
    "book": "middlegame",
    "lesson": 25,
    "tactic": "songXePhoiHop",
    "tone": "praise",
    "fen": "2R2abC1/3ka4/9/pr2r3p/6p2/P7P/4P1P2/4B4/4A4/1cR1KAB2 w",
    "move": "c0c8",
    "moveNotation": "Xs.8",
    "game": {
      "id": 7261,
      "red": "黑龙江 赵国荣",
      "black": "河南 颜成龙",
      "tournament": "",
      "date": "",
      "ply": 61
    }
  },
  {
    "book": "middlegame",
    "lesson": 25,
    "tactic": "songXePhoiHop",
    "tone": "praise",
    "fen": "4ka3/4a4/b3b4/1C2R4/7rp/2P1n1N2/P8/4r4/4A1R2/3A1K3 b",
    "move": "h5h0",
    "moveNotation": "X8.5",
    "game": {
      "id": 8450,
      "red": "江苏 徐健秒",
      "black": "武汉 王斌",
      "tournament": "",
      "date": "",
      "ply": 82
    }
  },
  {
    "book": "middlegame",
    "lesson": 28,
    "tactic": "xeMaPhaoTamTu",
    "tone": "praise",
    "fen": "4kab2/4a1c2/2R1b4/9/9/1r1n2PNC/P1C1P3P/3AB4/9/c3KAB2 b",
    "move": "b4b0",
    "moveNotation": "X2.4",
    "game": {
      "id": 1211,
      "red": "山东 谢岿",
      "black": "江苏 徐天红",
      "tournament": "",
      "date": "",
      "ply": 62
    }
  },
  {
    "book": "middlegame",
    "lesson": 29,
    "tactic": "xeSongMa",
    "tone": "praise",
    "fen": "3ak1b2/4a4/4b4/9/p8/9/Pn4r1P/2R6/1n1KA4/5R3 b",
    "move": "g3d3",
    "moveNotation": "X7-4",
    "game": {
      "id": 532,
      "red": "杭州 陈建国",
      "black": "河北 苗利明",
      "tournament": "",
      "date": "",
      "ply": 180
    }
  },
  {
    "book": "middlegame",
    "lesson": 29,
    "tactic": "xeSongMa",
    "tone": "praise",
    "fen": "3k2b2/6c2/4b1N1n/pC2r3p/1P7/5R3/P8/4p4/2r1A4/2NA1K3 w",
    "move": "f4f9",
    "moveNotation": "X4.5",
    "game": {
      "id": 7921,
      "red": "农民协会 李林",
      "black": "煤矿体协 孙树成",
      "tournament": "",
      "date": "",
      "ply": 101
    }
  },
  {
    "book": "middlegame",
    "lesson": 30,
    "tactic": "xeSongPhao",
    "tone": "praise",
    "fen": "3a1k3/4a4/9/7Rp/2b6/6B2/8P/6C2/2NK4c/5rBc1 b",
    "move": "f0f1",
    "moveNotation": "X6/1",
    "game": {
      "id": 1266,
      "red": "天津 张申宏",
      "black": "四川 李艾东",
      "tournament": "",
      "date": "",
      "ply": 78
    }
  },
  {
    "book": "middlegame",
    "lesson": 30,
    "tactic": "xeSongPhao",
    "tone": "praise",
    "fen": "2b1ka3/4a4/2n6/p1N1p4/3P5/1R3cr2/P8/B8/4C1c2/3rCKR2 b",
    "move": "g1f1",
    "moveNotation": "P7-6",
    "game": {
      "id": 3492,
      "red": "沈阳 卜风波",
      "black": "江苏 李群",
      "tournament": "",
      "date": "",
      "ply": 100
    }
  },
  {
    "book": "middlegame",
    "lesson": 32,
    "tactic": "kheoPhaSiTuong",
    "tone": "praise",
    "fen": "4kab2/1r7/r1P2a3/p4N2p/2b3p2/9/8P/3CB3B/4A4/2R1KA3 w",
    "move": "c0c5",
    "moveNotation": "X7.5",
    "game": {
      "id": 3356,
      "red": "黑龙江 赵国荣",
      "black": "上海 孙勇征",
      "tournament": "",
      "date": "",
      "ply": 69
    }
  },
  {
    "book": "middlegame",
    "lesson": 32,
    "tactic": "kheoPhaSiTuong",
    "tone": "praise",
    "fen": "4k1b2/4a4/5a3/p8/2b5p/P8/2R1N4/1r1A5/9/2BAK3c w",
    "move": "c3c5",
    "moveNotation": "X7.2",
    "game": {
      "id": 4126,
      "red": "河北 苗利明",
      "black": "上海 孙勇征",
      "tournament": "",
      "date": "",
      "ply": 73
    }
  },
  {
    "book": "middlegame",
    "lesson": 32,
    "tactic": "kheoPhaSiTuong",
    "tone": "praise",
    "fen": "1rbakab2/1r7/2n5c/p1p1p3p/7n1/P5R2/1cP1P3P/N1C1C1N2/9/1RBAKAB2 w",
    "move": "g4g9",
    "moveNotation": "X3.5",
    "game": {
      "id": 5776,
      "red": "江苏汤沟两相和 王斌",
      "black": "厦门港务控股 Zheng YiHong",
      "tournament": "",
      "date": "",
      "ply": 23
    }
  },
  {
    "book": "middlegame",
    "lesson": 35,
    "tactic": "vayPhao",
    "tone": "praise",
    "fen": "1n1k1ab2/4aR3/4C4/p1r1n3p/9/5p3/8P/3NB4/9/2BAKA3 b",
    "move": "c6c7",
    "moveNotation": "X3/1",
    "game": {
      "id": 347,
      "red": "广州 韩松龄",
      "black": "邮电体协 许波",
      "tournament": "",
      "date": "",
      "ply": 54
    }
  },
  {
    "book": "middlegame",
    "lesson": 35,
    "tactic": "vayPhao",
    "tone": "praise",
    "fen": "r3kab2/1R2a4/nR1cb4/p3p3p/5NpC1/8r/P3P2N1/4B4/4A4/4KAB2 b",
    "move": "i4h4",
    "moveNotation": "X9-8",
    "game": {
      "id": 9351,
      "red": "青岛 徐彬",
      "black": "山东 谢岿",
      "tournament": "",
      "date": "",
      "ply": 46
    }
  },
  {
    "book": "middlegame",
    "lesson": 36,
    "tactic": "maPhungBienTatVong",
    "tone": "praise",
    "fen": "3akab2/9/2n1b1nrc/p1p1pR2p/3c5/3r2P2/P1P1P3P/NC2B1N2/2C6/1R1AKAB2 b",
    "move": "d5a5",
    "moveNotation": "P4-1",
    "game": {
      "id": 2971,
      "red": "广东 宗永生",
      "black": "吉林 洪智",
      "tournament": "",
      "date": "",
      "ply": 28
    }
  },
  {
    "book": "middlegame",
    "lesson": 36,
    "tactic": "maPhungBienTatVong",
    "tone": "praise",
    "fen": "4kab1r/4a4/4b1n2/n1p5p/6p2/2Pr5/PR2P1P1P/4CcN2/9/2BAKABR1 w",
    "move": "b3b6",
    "moveNotation": "X8.3",
    "game": {
      "id": 6601,
      "red": "湖北 李雪松",
      "black": "河北 孙庆利",
      "tournament": "",
      "date": "",
      "ply": 23
    }
  },
  {
    "book": "middlegame",
    "lesson": 36,
    "tactic": "maPhungBienTatVong",
    "tone": "praise",
    "fen": "4kab2/4a4/3cb3n/p1P1p1p1N/3Rn4/1r7/P7P/N1C1B1C2/4A4/2BAK2c1 b",
    "move": "h0i0",
    "moveNotation": "P8-9",
    "game": {
      "id": 56,
      "red": "火车头 韩冰",
      "black": "四川 章文彤",
      "tournament": "",
      "date": "",
      "ply": 46
    }
  },
  {
    "book": "middlegame",
    "lesson": 38,
    "tactic": "tamNganThangTamXa",
    "tone": "note",
    "fen": "2b1ka3/4a4/2r1b2R1/p1c1p3p/9/2BN1N3/c3PC2P/3AB4/9/4KA3 b",
    "move": "a3f3",
    "moveNotation": "P1-6",
    "game": {
      "id": 8086,
      "red": "煤矿体协 孙树成",
      "black": "江苏 廖二平",
      "tournament": "",
      "date": "",
      "ply": 56
    }
  },
  {
    "book": "middlegame",
    "lesson": 39,
    "tactic": "tamXaThangTamNgan",
    "tone": "note",
    "fen": "3k1ab2/3ca4/4c4/pr2n3p/2b1P1p2/7R1/4N1P1P/B1N1B4/9/3AKA3 w",
    "move": "e5e6",
    "moveNotation": "B5.1",
    "game": {
      "id": 5226,
      "red": "云南 章文彤",
      "black": "江苏 张国凤",
      "tournament": "",
      "date": "",
      "ply": 61
    }
  },
  {
    "book": "middlegame",
    "lesson": 39,
    "tactic": "tamXaThangTamNgan",
    "tone": "note",
    "fen": "3ak4/4a4/4b1nR1/9/p3n3p/4N4/P3rC3/2C1B4/4A4/3AK1B2 b",
    "move": "e3e4",
    "moveNotation": "X5/1",
    "game": {
      "id": 5342,
      "red": "广东 庄玉庭",
      "black": "浙江 张申宏",
      "tournament": "",
      "date": "",
      "ply": 68
    }
  },
  {
    "book": "middlegame",
    "lesson": 39,
    "tactic": "tamXaThangTamNgan",
    "tone": "note",
    "fen": "3nkab2/4a4/1R2b1n2/C1p1p3p/9/2P1P1p2/P1r5P/2N1C4/4A4/2B1KAB2 b",
    "move": "c3c2",
    "moveNotation": "X3.1",
    "game": {
      "id": 6267,
      "red": "澳门 陈图炯",
      "black": "杭州 宋春雷",
      "tournament": "",
      "date": "",
      "ply": 38
    }
  },
  {
    "book": "middlegame",
    "lesson": 40,
    "tactic": "motXeDoiHai",
    "tone": "praise",
    "fen": "3k1ab2/2N1a4/4b4/8p/p5n2/4p1R2/r3P3P/4B3c/3CA4/2B1KA3 b",
    "move": "a3c3",
    "moveNotation": "X1-3",
    "game": {
      "id": 162,
      "red": "沈阳 苗永鹏",
      "black": "北京 张强",
      "tournament": "",
      "date": "",
      "ply": 100
    }
  },
  {
    "book": "middlegame",
    "lesson": 40,
    "tactic": "motXeDoiHai",
    "tone": "praise",
    "fen": "4kab2/4a4/1c2b4/1R4C1p/p1nn5/9/P4R2P/3Ar4/4A4/4K4 w",
    "move": "f3f5",
    "moveNotation": "X4.2",
    "game": {
      "id": 532,
      "red": "杭州 陈建国",
      "black": "河北 苗利明",
      "tournament": "",
      "date": "",
      "ply": 145
    }
  },
  {
    "book": "middlegame",
    "lesson": 40,
    "tactic": "motXeDoiHai",
    "tone": "praise",
    "fen": "3rkab2/4a4/2n1b3n/pCCN5/2p5p/1R3R3/P1P5P/3r5/4K4/5A2c b",
    "move": "d2d6",
    "moveNotation": "Xt/4",
    "game": {
      "id": 6656,
      "red": "辽宁 陈卓",
      "black": "浙江 谢丹枫",
      "tournament": "",
      "date": "",
      "ply": 66
    }
  },
  {
    "book": "middlegame",
    "lesson": 41,
    "tactic": "motXeDoiBa",
    "tone": "praise",
    "fen": "1r2kabr1/4a4/4b4/p7p/6p2/1n1R5/P1P1P1P1P/N3B4/1c1CA2RN/2BAK4 b",
    "move": "h9h1",
    "moveNotation": "X8.8",
    "game": {
      "id": 10121,
      "red": "黑龙江 赵国荣",
      "black": "广东 吕钦",
      "tournament": "",
      "date": "",
      "ply": 34
    }
  },
  {
    "book": "middlegame",
    "lesson": 41,
    "tactic": "motXeDoiBa",
    "tone": "praise",
    "fen": "3k1ab2/2N1a4/4b4/8p/p5n2/4p1R2/r3P3P/4B3c/3CA4/2B1KA3 b",
    "move": "a3c3",
    "moveNotation": "X1-3",
    "game": {
      "id": 162,
      "red": "沈阳 苗永鹏",
      "black": "北京 张强",
      "tournament": "",
      "date": "",
      "ply": 100
    }
  },
  {
    "book": "middlegame",
    "lesson": 41,
    "tactic": "motXeDoiBa",
    "tone": "praise",
    "fen": "2bakab2/3r5/2n2c3/p1p1p3p/1r3n3/P1P2R3/1c2P3P/N1C1C1N2/1R7/2BAKAB2 w",
    "move": "b1b3",
    "moveNotation": "X8.2",
    "game": {
      "id": 1716,
      "red": "黑龙江 王琳娜",
      "black": "火车头 张梅",
      "tournament": "",
      "date": "",
      "ply": 29
    }
  },
  {
    "book": "middlegame",
    "lesson": 42,
    "tactic": "maVanNhuLong",
    "tone": "praise",
    "fen": "4kab2/4a4/4b4/p1p1c4/7np/2P4N1/n3c1P2/3C1C3/2NK5/2BA1AB2 b",
    "move": "a3c4",
    "moveNotation": "M1/3",
    "game": {
      "id": 10066,
      "red": "冶金体协 尚威",
      "black": "上海 胡荣华",
      "tournament": "",
      "date": "",
      "ply": 64
    }
  },
  {
    "book": "middlegame",
    "lesson": 42,
    "tactic": "maVanNhuLong",
    "tone": "praise",
    "fen": "2ba1kb2/4a4/9/p3CN2p/2P6/5p3/6r1P/5C3/9/2BAKAB2 w",
    "move": "f6h5",
    "moveNotation": "M4/2",
    "game": {
      "id": 3825,
      "red": "四川 何静",
      "black": "北京 史思旋",
      "tournament": "",
      "date": "",
      "ply": 59
    }
  },
  {
    "book": "middlegame",
    "lesson": 42,
    "tactic": "maVanNhuLong",
    "tone": "praise",
    "fen": "3ak4/7c1/3an4/3N5/9/9/P8/5A3/1C7/2B1KAB2 w",
    "move": "d6f5",
    "moveNotation": "M6/4",
    "game": {
      "id": 4158,
      "red": "上海 林宏敏",
      "black": "浙江 邱东",
      "tournament": "",
      "date": "",
      "ply": 77
    }
  },
  {
    "book": "middlegame",
    "lesson": 46,
    "tactic": "pheTotPhanCong",
    "tone": "praise",
    "fen": "2bak4/4a4/4b4/4c2P1/9/9/5p3/4C1r2/4A4/4KRB2 b",
    "move": "f3f2",
    "moveNotation": "B6.1",
    "game": {
      "id": 865,
      "red": "澳门 李锦欢",
      "black": "沈阳 尚威",
      "tournament": "",
      "date": "",
      "ply": 104
    }
  },
  {
    "book": "middlegame",
    "lesson": 46,
    "tactic": "pheTotPhanCong",
    "tone": "praise",
    "fen": "9/5n3/4kaR2/3c3Rp/p2r5/2P1r1N2/P7P/4B4/4A4/2BAK4 w",
    "move": "c4c5",
    "moveNotation": "B7.1",
    "game": {
      "id": 2234,
      "red": "火车头 宋国强",
      "black": "江苏 赵剑",
      "tournament": "",
      "date": "",
      "ply": 89
    }
  },
  {
    "book": "middlegame",
    "lesson": 46,
    "tactic": "pheTotPhanCong",
    "tone": "praise",
    "fen": "5kb2/3Ra4/5a3/3N5/9/9/3p5/9/3KAn3/2r2AB2 b",
    "move": "d3d2",
    "moveNotation": "B4.1",
    "game": {
      "id": 4291,
      "red": "江苏 杨伊",
      "black": "北京 唐丹",
      "tournament": "",
      "date": "",
      "ply": 166
    }
  },
  {
    "book": "middlegame",
    "lesson": 47,
    "tactic": "chienThuatMuuBinh",
    "tone": "praise",
    "fen": "r1bakab1r/9/4c1n2/p3p1p1p/2pn5/1c4PN1/P1P1P3P/1CN1B2C1/4A4/R1BAK3R w",
    "move": "h4g6",
    "moveNotation": "M2.3",
    "game": {
      "id": 496,
      "red": "黑龙江 赵国荣",
      "black": "广东 许银川",
      "tournament": "",
      "date": "",
      "ply": 13
    }
  },
  {
    "book": "middlegame",
    "lesson": 47,
    "tactic": "chienThuatMuuBinh",
    "tone": "praise",
    "fen": "2b1ka3/4a4/2c1b3c/p1C3p2/2n5C/2RN2P2/P3r3P/4B4/1r2A4/2BAKR3 b",
    "move": "e3i3",
    "moveNotation": "X5-9",
    "game": {
      "id": 716,
      "red": "吉林 陶汉明",
      "black": "上海 孙勇征",
      "tournament": "",
      "date": "",
      "ply": 52
    }
  },
  {
    "book": "middlegame",
    "lesson": 47,
    "tactic": "chienThuatMuuBinh",
    "tone": "praise",
    "fen": "4kab2/4a4/2n1b1n1c/3r3rp/p2c2p2/3NCR3/P3N1P1P/2C1B4/1R2A4/2B1KA3 b",
    "move": "i7i3",
    "moveNotation": "P9.4",
    "game": {
      "id": 2256,
      "red": "上海 万春林",
      "black": "湖北 李雪松",
      "tournament": "",
      "date": "",
      "ply": 38
    }
  },
  {
    "book": "endgame",
    "lesson": 4,
    "tactic": "binhTanSiTuong",
    "tone": "praise",
    "fen": "2ba1ab2/9/4k4/9/9/6B2/8n/4B4/3pAK3/9 b",
    "move": "d1e1",
    "moveNotation": "B4-5",
    "game": {
      "id": 2937,
      "red": "吉林 陶汉明",
      "black": "黑龙江 于幼华",
      "tournament": "",
      "date": "",
      "ply": 176
    }
  },
  {
    "book": "endgame",
    "lesson": 4,
    "tactic": "binhTanSiTuong",
    "tone": "praise",
    "fen": "3ak1Cc1/4a1n2/4b4/4P4/9/4N4/P8/5A3/9/2B1KAB2 w",
    "move": "e6e7",
    "moveNotation": "B5.1",
    "game": {
      "id": 4158,
      "red": "上海 林宏敏",
      "black": "浙江 邱东",
      "tournament": "",
      "date": "",
      "ply": 69
    }
  },
  {
    "book": "endgame",
    "lesson": 4,
    "tactic": "binhTanSiTuong",
    "tone": "praise",
    "fen": "3ak4/4a4/9/N5P2/1Pbn5/9/4p4/B8/4A4/4KAB2 w",
    "move": "b5c5",
    "moveNotation": "B8-7",
    "game": {
      "id": 5083,
      "red": "山西 周小平",
      "black": "浦东华工 葛维蒲",
      "tournament": "",
      "date": "",
      "ply": 95
    }
  },
  {
    "book": "endgame",
    "lesson": 5,
    "tactic": "muuBinhCoXe",
    "tone": "praise",
    "fen": "3a2b2/4k4/1c1abN3/4pR2p/3P5/2B1P4/2r6/9/4A4/2BAK4 w",
    "move": "f6e6",
    "moveNotation": "X4-5",
    "game": {
      "id": 3466,
      "red": "黑龙江 聂铁文",
      "black": "湖北 柳大华",
      "tournament": "",
      "date": "",
      "ply": 125
    }
  },
  {
    "book": "endgame",
    "lesson": 5,
    "tactic": "muuBinhCoXe",
    "tone": "praise",
    "fen": "4k1b2/4a4/5a3/pr7/2R5p/P8/4N4/3A5/9/2BAK3c w",
    "move": "c5i5",
    "moveNotation": "X7-1",
    "game": {
      "id": 4126,
      "red": "河北 苗利明",
      "black": "上海 孙勇征",
      "tournament": "",
      "date": "",
      "ply": 75
    }
  },
  {
    "book": "endgame",
    "lesson": 5,
    "tactic": "muuBinhCoXe",
    "tone": "praise",
    "fen": "4ka3/4a4/9/p1rC4p/9/2c6/P4R2P/4B4/4A4/2BAK4 w",
    "move": "f3f6",
    "moveNotation": "X4.3",
    "game": {
      "id": 8228,
      "red": "广东 许银川",
      "black": "广东 宗永生",
      "tournament": "",
      "date": "",
      "ply": 65
    }
  },
  {
    "book": "endgame",
    "lesson": 6,
    "tactic": "muuBinhKhongXe",
    "tone": "praise",
    "fen": "4kab2/4a4/4b4/3C5/6p2/2B6/P2Cc1P1P/3A2n2/9/4KA3 b",
    "move": "g2i3",
    "moveNotation": "M7/9",
    "game": {
      "id": 10176,
      "red": "上海 胡荣华",
      "black": "邮电体协 潘振波",
      "tournament": "",
      "date": "",
      "ply": 62
    }
  },
  {
    "book": "endgame",
    "lesson": 6,
    "tactic": "muuBinhKhongXe",
    "tone": "praise",
    "fen": "1n2ka3/c3a4/4b3b/2p1p3p/6p2/2PN5/P3P3P/4B1N2/9/2BAKA3 w",
    "move": "d4c6",
    "moveNotation": "M6.7",
    "game": {
      "id": 10286,
      "red": "火车头 金波",
      "black": "湖北 李望祥",
      "tournament": "",
      "date": "",
      "ply": 35
    }
  },
  {
    "book": "endgame",
    "lesson": 6,
    "tactic": "muuBinhKhongXe",
    "tone": "praise",
    "fen": "2ba5/C3a4/5kn2/2N1p4/1P3n2p/2P6/4P1p1P/4B4/4A4/2BAK4 b",
    "move": "f5e3",
    "moveNotation": "M6.5",
    "game": {
      "id": 10616,
      "red": "广东 许银川",
      "black": "北京 苗永鹏",
      "tournament": "",
      "date": "",
      "ply": 70
    }
  },
  {
    "book": "endgame",
    "lesson": 7,
    "tactic": "phaSiTuongCoXe",
    "tone": "praise",
    "fen": "4kab2/1r7/r1P2a3/p4N2p/2b3p2/9/8P/3CB3B/4A4/2R1KA3 w",
    "move": "c0c5",
    "moveNotation": "X7.5",
    "game": {
      "id": 3356,
      "red": "黑龙江 赵国荣",
      "black": "上海 孙勇征",
      "tournament": "",
      "date": "",
      "ply": 69
    }
  },
  {
    "book": "endgame",
    "lesson": 7,
    "tactic": "phaSiTuongCoXe",
    "tone": "praise",
    "fen": "1Rb1ka3/4a4/9/p7p/5P3/P4r3/4N3P/4B4/4K4/c4AB2 w",
    "move": "b9c9",
    "moveNotation": "X8-7",
    "game": {
      "id": 4511,
      "red": "湖北 柳大华",
      "black": "湖南 谢业枧",
      "tournament": "",
      "date": "",
      "ply": 105
    }
  },
  {
    "book": "endgame",
    "lesson": 7,
    "tactic": "phaSiTuongCoXe",
    "tone": "praise",
    "fen": "1R1aka3/3P5/4b4/p1p5p/9/9/P1P1r3P/4CA3/3c1K3/2B6 w",
    "move": "d8d9",
    "moveNotation": "B6.1",
    "game": {
      "id": 88,
      "red": "? 黄志强",
      "black": "八一 杨永明",
      "tournament": "",
      "date": "",
      "ply": 85
    }
  },
  {
    "book": "endgame",
    "lesson": 8,
    "tactic": "phaSiTuongKhongXe",
    "tone": "praise",
    "fen": "4c4/5k3/3a1a2C/p2C5/9/8P/9/4B4/4A4/3K5 w",
    "move": "i7d7",
    "moveNotation": "P1-6",
    "game": {
      "id": 606,
      "red": "火车头 金波",
      "black": "上海浦东 董旭彬",
      "tournament": "",
      "date": "",
      "ply": 93
    }
  },
  {
    "book": "endgame",
    "lesson": 8,
    "tactic": "phaSiTuongKhongXe",
    "tone": "praise",
    "fen": "4kab2/4a4/4b4/4P4/2n2N2p/6P2/8P/B1C1BA3/9/1c1K5 w",
    "move": "e6e7",
    "moveNotation": "B5.1",
    "game": {
      "id": 10396,
      "red": "广东 吕钦",
      "black": "吉林 陶汉明",
      "tournament": "",
      "date": "",
      "ply": 97
    }
  },
  {
    "book": "endgame",
    "lesson": 8,
    "tactic": "phaSiTuongKhongXe",
    "tone": "praise",
    "fen": "2ba5/C1N1ak3/4b1n2/4p4/1P3n2p/2P6/4P1p1P/4B4/4A4/2BAK4 w",
    "move": "c8e7",
    "moveNotation": "M7/5",
    "game": {
      "id": 10616,
      "red": "广东 许银川",
      "black": "北京 苗永鹏",
      "tournament": "",
      "date": "",
      "ply": 67
    }
  },
  {
    "book": "endgame",
    "lesson": 9,
    "tactic": "nguyenTacChiemTrung",
    "tone": "praise",
    "fen": "9/1r3k3/3Rc1R2/8p/9/5r3/P7P/4B4/1n2A4/2B1KA3 w",
    "move": "g7e7",
    "moveNotation": "X3-5",
    "game": {
      "id": 496,
      "red": "黑龙江 赵国荣",
      "black": "广东 许银川",
      "tournament": "",
      "date": "",
      "ply": 101
    }
  },
  {
    "book": "endgame",
    "lesson": 9,
    "tactic": "nguyenTacChiemTrung",
    "tone": "praise",
    "fen": "5k3/4n1R2/9/p7p/3c2n2/6B2/P4p2P/9/4A4/2BAK4 w",
    "move": "g8e8",
    "moveNotation": "X3-5",
    "game": {
      "id": 551,
      "red": "上海浦东 董旭彬",
      "black": "福建 王晓华",
      "tournament": "",
      "date": "",
      "ply": 63
    }
  },
  {
    "book": "endgame",
    "lesson": 9,
    "tactic": "nguyenTacChiemTrung",
    "tone": "praise",
    "fen": "2bak4/4a4/b2c3P1/6r2/3R4p/9/2N6/3A1A3/3K5/9 b",
    "move": "g6e6",
    "moveNotation": "X7-5",
    "game": {
      "id": 7192,
      "red": "大连 苗永鹏",
      "black": "河北 苗利明",
      "tournament": "",
      "date": "",
      "ply": 148
    }
  },
  {
    "book": "endgame",
    "lesson": 10,
    "tactic": "loSuonApDay",
    "tone": "praise",
    "fen": "3k5/9/4b4/3PN4/4n1b1P/9/9/4p4/9/3K5 w",
    "move": "d6d7",
    "moveNotation": "B6.1",
    "game": {
      "id": 1321,
      "red": "北京 龚晓民",
      "black": "山东 侯昭忠",
      "tournament": "",
      "date": "",
      "ply": 103
    }
  },
  {
    "book": "endgame",
    "lesson": 10,
    "tactic": "loSuonApDay",
    "tone": "praise",
    "fen": "4ka3/6P2/b3ra3/2R2N3/p8/9/2P6/9/3K5/3A1cB2 w",
    "move": "g8f8",
    "moveNotation": "B3-4",
    "game": {
      "id": 6489,
      "red": "湖南 孙浩宇",
      "black": "火车头 崔峻",
      "tournament": "",
      "date": "",
      "ply": 121
    }
  },
  {
    "book": "endgame",
    "lesson": 10,
    "tactic": "loSuonApDay",
    "tone": "praise",
    "fen": "3k5/9/9/3P5/9/4R4/2r2p3/4B4/4A4/2B1KA3 w",
    "move": "d6d7",
    "moveNotation": "B6.1",
    "game": {
      "id": 7155,
      "red": "河北金环钢构 苗利明",
      "black": "河南 武俊强",
      "tournament": "",
      "date": "",
      "ply": 97
    }
  },
  {
    "book": "endgame",
    "lesson": 11,
    "tactic": "maHoatChienThang",
    "tone": "praise",
    "fen": "2b2R3/4k4/4b4/3P4p/p2N5/4P4/8P/4n1r2/c4K3/3A1AB2 b",
    "move": "e2c1",
    "moveNotation": "M5.3",
    "game": {
      "id": 276,
      "red": "江苏 张国凤",
      "black": "云南 赵冠芳",
      "tournament": "",
      "date": "",
      "ply": 94
    }
  },
  {
    "book": "endgame",
    "lesson": 11,
    "tactic": "maHoatChienThang",
    "tone": "praise",
    "fen": "2ba2b2/3ka4/9/p2PC3p/5N3/5p3/5r2P/5C3/4A4/2BAK1B2 w",
    "move": "f5d4",
    "moveNotation": "M4/6",
    "game": {
      "id": 3825,
      "red": "四川 何静",
      "black": "北京 史思旋",
      "tournament": "",
      "date": "",
      "ply": 71
    }
  },
  {
    "book": "endgame",
    "lesson": 11,
    "tactic": "maHoatChienThang",
    "tone": "praise",
    "fen": "3k5/4a4/3a1c3/p2r4p/2R6/6N2/9/4B4/4A2C1/2BA1K3 w",
    "move": "g4e5",
    "moveNotation": "M3.5",
    "game": {
      "id": 4676,
      "red": "北京 张申宏",
      "black": "浙江 于幼华",
      "tournament": "",
      "date": "",
      "ply": 81
    }
  },
  {
    "book": "endgame",
    "lesson": 13,
    "tactic": "binhChungHuuLoi",
    "tone": "note",
    "fen": "4kab2/4a4/4b4/9/3C2p2/2BC5/P2c2P1P/3Ac1n2/9/4KA3 w",
    "move": "d5d3",
    "moveNotation": "Pt/2",
    "game": {
      "id": 10176,
      "red": "上海 胡荣华",
      "black": "邮电体协 潘振波",
      "tournament": "",
      "date": "",
      "ply": 59
    }
  },
  {
    "book": "endgame",
    "lesson": 13,
    "tactic": "binhChungHuuLoi",
    "tone": "note",
    "fen": "1n2kab2/c3a4/4b3C/2p1p3p/6p2/2PN5/P3P3P/4B1N2/9/2BAKA3 b",
    "move": "g9i7",
    "moveNotation": "T7.9",
    "game": {
      "id": 10286,
      "red": "火车头 金波",
      "black": "湖北 李望祥",
      "tournament": "",
      "date": "",
      "ply": 34
    }
  },
  {
    "book": "endgame",
    "lesson": 13,
    "tactic": "binhChungHuuLoi",
    "tone": "note",
    "fen": "2ba1a3/2N1k4/4b1n2/C3p4/Pc3n2p/2P6/4P1p1P/4B4/4A4/2BAK4 w",
    "move": "a5b5",
    "moveNotation": "B9-8",
    "game": {
      "id": 10616,
      "red": "广东 许银川",
      "black": "北京 苗永鹏",
      "tournament": "",
      "date": "",
      "ply": 63
    }
  },
  {
    "book": "endgame",
    "lesson": 14,
    "tactic": "totApCung",
    "tone": "praise",
    "fen": "4ka3/4a4/b3b4/1r7/6r2/2P3N2/PC1R2p2/9/4A4/3AK4 b",
    "move": "g3g2",
    "moveNotation": "B7.1",
    "game": {
      "id": 8450,
      "red": "江苏 徐健秒",
      "black": "武汉 王斌",
      "tournament": "",
      "date": "",
      "ply": 114
    }
  },
  {
    "book": "endgame",
    "lesson": 14,
    "tactic": "totApCung",
    "tone": "praise",
    "fen": "4kab2/4a4/4b4/1R7/2n4P1/2C6/2p5r/4B4/4A4/3AK1B2 b",
    "move": "c3c2",
    "moveNotation": "B3.1",
    "game": {
      "id": 9406,
      "red": "大学生 马军",
      "black": "厦门 郑一泓",
      "tournament": "",
      "date": "",
      "ply": 68
    }
  },
  {
    "book": "endgame",
    "lesson": 14,
    "tactic": "totApCung",
    "tone": "praise",
    "fen": "2b1ka3/2P1a4/4b4/p7p/4c4/9/P5R1P/2r6/4A4/3A1K3 w",
    "move": "c8d8",
    "moveNotation": "B7-6",
    "game": {
      "id": 1309,
      "red": "农民体协 程进超",
      "black": "四川 李艾东",
      "tournament": "",
      "date": "",
      "ply": 79
    }
  },
  {
    "book": "endgame",
    "lesson": 15,
    "tactic": "siTuongPhongAn",
    "tone": "praise",
    "fen": "4kab2/1r2a4/r3b4/p1P2N2p/6p2/9/8P/3CB3B/4A4/2R1KA3 b",
    "move": "e8f7",
    "moveNotation": "S5.6",
    "game": {
      "id": 3356,
      "red": "黑龙江 赵国荣",
      "black": "上海 孙勇征",
      "tournament": "",
      "date": "",
      "ply": 66
    }
  },
  {
    "book": "endgame",
    "lesson": 15,
    "tactic": "siTuongPhongAn",
    "tone": "praise",
    "fen": "4ka3/1c2a4/4N4/9/8p/2B1n1P2/8P/B3C4/4A4/3K5 b",
    "move": "e8d7",
    "moveNotation": "S5.4",
    "game": {
      "id": 10396,
      "red": "广东 吕钦",
      "black": "吉林 陶汉明",
      "tournament": "",
      "date": "",
      "ply": 108
    }
  },
  {
    "book": "endgame",
    "lesson": 15,
    "tactic": "siTuongPhongAn",
    "tone": "praise",
    "fen": "2b1ka3/4a4/2c1b4/3R1NP2/2n1P4/p8/4p4/8B/2c1A4/2BA1K3 b",
    "move": "e8f7",
    "moveNotation": "S5.6",
    "game": {
      "id": 166,
      "red": "哈尔滨 聂铁文",
      "black": "湖南 张申宏",
      "tournament": "",
      "date": "",
      "ply": 64
    }
  },
  {
    "book": "endgame",
    "lesson": 16,
    "tactic": "tuongTroCong",
    "tone": "praise",
    "fen": "4kab2/4a4/4b4/4P4/5N2p/6P2/1n6P/B1C1BA3/9/1c2K4 w",
    "move": "e0d0",
    "moveNotation": "Tg5-6",
    "game": {
      "id": 10396,
      "red": "广东 吕钦",
      "black": "吉林 陶汉明",
      "tournament": "",
      "date": "",
      "ply": 95
    }
  },
  {
    "book": "endgame",
    "lesson": 16,
    "tactic": "tuongTroCong",
    "tone": "praise",
    "fen": "2bak1b2/1R2a4/N1n3n2/p7p/2P6/9/P3p1c1P/4B4/4A4/2BAK4 b",
    "move": "e9f9",
    "moveNotation": "Tg5-6",
    "game": {
      "id": 551,
      "red": "上海浦东 董旭彬",
      "black": "福建 王晓华",
      "tournament": "",
      "date": "",
      "ply": 40
    }
  },
  {
    "book": "endgame",
    "lesson": 16,
    "tactic": "tuongTroCong",
    "tone": "praise",
    "fen": "2bak4/4a4/9/nNP1N3p/6p2/1p6P/8c/4B4/4A4/2BAK4 b",
    "move": "e9f9",
    "moveNotation": "Tg5-6",
    "game": {
      "id": 3191,
      "red": "江苏 李群",
      "black": "广东 李鸿嘉",
      "tournament": "",
      "date": "",
      "ply": 50
    }
  },
  {
    "book": "endgame",
    "lesson": 18,
    "tactic": "khuyetSiKyGi",
    "tone": "praise",
    "fen": "2Ra1kb2/4n4/9/p7p/3P2nc1/6B2/P4p2P/9/4A4/2BAK4 w",
    "move": "c9d9",
    "moveNotation": "X7-6",
    "game": {
      "id": 551,
      "red": "上海浦东 董旭彬",
      "black": "福建 王晓华",
      "tournament": "",
      "date": "",
      "ply": 57
    }
  },
  {
    "book": "endgame",
    "lesson": 18,
    "tactic": "khuyetSiKyGi",
    "tone": "praise",
    "fen": "2bak4/4a4/4b4/4c2P1/9/4C4/9/5pr2/4A4/4KRB2 b",
    "move": "g2g1",
    "moveNotation": "X7.1",
    "game": {
      "id": 865,
      "red": "澳门 李锦欢",
      "black": "沈阳 尚威",
      "tournament": "",
      "date": "",
      "ply": 106
    }
  },
  {
    "book": "endgame",
    "lesson": 18,
    "tactic": "khuyetSiKyGi",
    "tone": "praise",
    "fen": "5k3/4a1N2/9/7R1/2p6/8r/4P3P/4B4/4A4/4KAB2 w",
    "move": "h6f6",
    "moveNotation": "X2-4",
    "game": {
      "id": 7701,
      "red": "黑龙江 郭莉萍",
      "black": "黑龙江 程思萌",
      "tournament": "",
      "date": "",
      "ply": 109
    }
  },
  {
    "book": "endgame",
    "lesson": 20,
    "tactic": "coTanPhaoHoan",
    "tone": "praise",
    "fen": "3ak4/4aP3/9/5C3/4R4/1c7/p5r2/4B4/4A4/2BAK4 b",
    "move": "b4b8",
    "moveNotation": "P2/4",
    "game": {
      "id": 8228,
      "red": "广东 许银川",
      "black": "广东 宗永生",
      "tournament": "",
      "date": "",
      "ply": 106
    }
  },
  {
    "book": "endgame",
    "lesson": 20,
    "tactic": "coTanPhaoHoan",
    "tone": "praise",
    "fen": "1Cba5/4ak3/9/2N2P3/3c4p/P3p4/9/4BA3/4A1n2/2BK5 w",
    "move": "b9b1",
    "moveNotation": "P8/8",
    "game": {
      "id": 10671,
      "red": "湖北 柳大华",
      "black": "南方棋院 黄仕清",
      "tournament": "",
      "date": "",
      "ply": 87
    }
  },
  {
    "book": "endgame",
    "lesson": 20,
    "tactic": "coTanPhaoHoan",
    "tone": "praise",
    "fen": "2ba1kb2/2N1a4/6n2/p3n3p/3P5/1R7/P3pc2P/4B4/4A4/2BAK4 b",
    "move": "f3f8",
    "moveNotation": "P6/5",
    "game": {
      "id": 551,
      "red": "上海浦东 董旭彬",
      "black": "福建 王晓华",
      "tournament": "",
      "date": "",
      "ply": 46
    }
  },
  {
    "book": "endgame",
    "lesson": 21,
    "tactic": "donTotKhongCheTuyen",
    "tone": "praise",
    "fen": "3akab2/9/4bn3/p8/3P4p/4r4/PR7/4C4/4A4/2B1KA3 w",
    "move": "b3i3",
    "moveNotation": "X8-1",
    "game": {
      "id": 2230,
      "red": "四川 李艾东",
      "black": "沈阳 金波",
      "tournament": "",
      "date": "",
      "ply": 85
    }
  },
  {
    "book": "endgame",
    "lesson": 21,
    "tactic": "donTotKhongCheTuyen",
    "tone": "praise",
    "fen": "4kab2/4a4/4b4/8p/p8/4P1R1P/2r6/4B3c/4A4/3CKA3 b",
    "move": "c3e3",
    "moveNotation": "X3-5",
    "game": {
      "id": 162,
      "red": "沈阳 苗永鹏",
      "black": "北京 张强",
      "tournament": "",
      "date": "",
      "ply": 110
    }
  },
  {
    "book": "endgame",
    "lesson": 21,
    "tactic": "donTotKhongCheTuyen",
    "tone": "praise",
    "fen": "2bak4/4a4/4bc3/7r1/9/5p2P/6R2/C4A3/4A4/4K1B2 b",
    "move": "h6i6",
    "moveNotation": "X8-9",
    "game": {
      "id": 865,
      "red": "澳门 李锦欢",
      "black": "沈阳 尚威",
      "tournament": "",
      "date": "",
      "ply": 72
    }
  },
  {
    "book": "endgame",
    "lesson": 22,
    "tactic": "doiPhaoLayMa",
    "tone": "praise",
    "fen": "4k4/4a4/3n1a3/9/2r6/3R2B2/2p6/3C5/4A4/4KAB2 w",
    "move": "d2d7",
    "moveNotation": "P6.5",
    "game": {
      "id": 2567,
      "red": "江苏 张国凤",
      "black": "山西 董波",
      "tournament": "",
      "date": "",
      "ply": 127
    }
  },
  {
    "book": "endgame",
    "lesson": 22,
    "tactic": "maThangPhao",
    "tone": "note",
    "fen": "3ak4/4a4/4b3b/9/P7p/2B1n1P2/8P/4BA3/4A3C/4K4 w",
    "move": "i1i5",
    "moveNotation": "P1.4",
    "game": {
      "id": 8581,
      "red": "上海 万春林",
      "black": "云南 康宏",
      "tournament": "",
      "date": "",
      "ply": 103
    }
  },
  {
    "book": "endgame",
    "lesson": 23,
    "tactic": "chienThuatKiemChe",
    "tone": "praise",
    "fen": "4kc3/4a2r1/6R2/p8/8P/2P6/9/5A3/9/2BAKCB2 w",
    "move": "g7g9",
    "moveNotation": "X3.2",
    "game": {
      "id": 8196,
      "red": "河北 阎文清",
      "black": "湖南 肖革联",
      "tournament": "",
      "date": "",
      "ply": 107
    }
  },
  {
    "book": "endgame",
    "lesson": 24,
    "tactic": "nuocCho",
    "tone": "praise",
    "fen": "3a1k3/4a4/9/p3R2Np/5P3/P8/9/4B4/8r/c3KAB2 w",
    "move": "e2g4",
    "moveNotation": "T5.3",
    "game": {
      "id": 4511,
      "red": "湖北 柳大华",
      "black": "湖南 谢业枧",
      "tournament": "",
      "date": "",
      "ply": 123
    }
  },
  {
    "book": "endgame",
    "lesson": 24,
    "tactic": "nuocCho",
    "tone": "praise",
    "fen": "3P1a3/1R1ck4/4b4/p1p5p/9/9/P1P1r3P/4CA3/5K3/2B6 w",
    "move": "f2e1",
    "moveNotation": "S4/5",
    "game": {
      "id": 88,
      "red": "? 黄志强",
      "black": "八一 杨永明",
      "tournament": "",
      "date": "",
      "ply": 89
    }
  },
  {
    "book": "endgame",
    "lesson": 24,
    "tactic": "nuocCho",
    "tone": "praise",
    "fen": "2ba1ab2/9/4k4/9/9/4n4/9/4B3B/3pA4/4KA3 b",
    "move": "e7e8",
    "moveNotation": "Tg5/1",
    "game": {
      "id": 2937,
      "red": "吉林 陶汉明",
      "black": "黑龙江 于幼华",
      "tournament": "",
      "date": "",
      "ply": 154
    }
  },
  {
    "book": "endgame",
    "lesson": 25,
    "tactic": "chienThuatVayKhon",
    "tone": "praise",
    "fen": "2b1ka3/4a4/2P1b4/p7p/9/9/P2pc3P/B3C3B/4A4/3AKR1r1 b",
    "move": "h0h2",
    "moveNotation": "X8/2",
    "game": {
      "id": 1309,
      "red": "农民体协 程进超",
      "black": "四川 李艾东",
      "tournament": "",
      "date": "",
      "ply": 66
    }
  },
  {
    "book": "endgame",
    "lesson": 25,
    "tactic": "chienThuatVayKhon",
    "tone": "praise",
    "fen": "3k1ab2/4c4/4ba3/8p/4N4/6P2/7RP/B8/4KC3/3r5 b",
    "move": "d0d5",
    "moveNotation": "X4/5",
    "game": {
      "id": 5046,
      "red": "郑州 李忠雨",
      "black": "宁夏 刘明",
      "tournament": "",
      "date": "",
      "ply": 84
    }
  },
  {
    "book": "endgame",
    "lesson": 25,
    "tactic": "chienThuatVayKhon",
    "tone": "praise",
    "fen": "2ba1k3/4a4/5c3/p4R1P1/4C3r/3p2p2/P8/9/9/2BAKA3 w",
    "move": "e5f5",
    "moveNotation": "P5-4",
    "game": {
      "id": 8006,
      "red": "黑龙江 张晓平",
      "black": "成都 陈鱼",
      "tournament": "",
      "date": "",
      "ply": 77
    }
  },
  {
    "book": "endgame",
    "lesson": 26,
    "tactic": "kyThuatDonToa",
    "tone": "praise",
    "fen": "4kab2/9/r1P2a3/p4N2p/2R3p2/9/1r6P/3C4B/4A4/2B1KA3 w",
    "move": "c5e5",
    "moveNotation": "X7-5",
    "game": {
      "id": 3356,
      "red": "黑龙江 赵国荣",
      "black": "上海 孙勇征",
      "tournament": "",
      "date": "",
      "ply": 73
    }
  },
  {
    "book": "endgame",
    "lesson": 26,
    "tactic": "kyThuatDonToa",
    "tone": "praise",
    "fen": "3k1ab2/4a4/4b4/9/1C4p2/2BC5/P2c2P1P/3Ac1n2/9/4KA3 w",
    "move": "b5d5",
    "moveNotation": "P8-6",
    "game": {
      "id": 10176,
      "red": "上海 胡荣华",
      "black": "邮电体协 潘振波",
      "tournament": "",
      "date": "",
      "ply": 57
    }
  },
  {
    "book": "endgame",
    "lesson": 26,
    "tactic": "kyThuatDonToa",
    "tone": "praise",
    "fen": "2baka3/9/4b1n2/CN2p4/Pc3n2p/2P6/4P1p1P/4B4/4A4/2BAK4 w",
    "move": "b6c8",
    "moveNotation": "M8.7",
    "game": {
      "id": 10616,
      "red": "广东 许银川",
      "black": "北京 苗永鹏",
      "tournament": "",
      "date": "",
      "ply": 61
    }
  },
  {
    "book": "endgame",
    "lesson": 27,
    "tactic": "kyThuatDanhChan",
    "tone": "praise",
    "fen": "3ak4/4a4/5c3/4R3p/p8/2r5P/9/1C2B4/4A4/4KA3 b",
    "move": "c4b4",
    "moveNotation": "X3-2",
    "game": {
      "id": 2197,
      "red": "上海浦东 葛维蒲",
      "black": "四川 蒋全胜",
      "tournament": "",
      "date": "",
      "ply": 84
    }
  },
  {
    "book": "endgame",
    "lesson": 27,
    "tactic": "kyThuatDanhChan",
    "tone": "praise",
    "fen": "4k4/4a4/5a3/9/2nr5/2R3B2/1p7/4B4/3CA4/4KA3 w",
    "move": "d1d2",
    "moveNotation": "P6.1",
    "game": {
      "id": 2567,
      "red": "江苏 张国凤",
      "black": "山西 董波",
      "tournament": "",
      "date": "",
      "ply": 121
    }
  },
  {
    "book": "endgame",
    "lesson": 27,
    "tactic": "kyThuatDanhChan",
    "tone": "praise",
    "fen": "2bakab2/9/9/p3C3p/2P1p4/9/r5P1P/9/4N4/C1BAKAB2 w",
    "move": "a0a2",
    "moveNotation": "P9.2",
    "game": {
      "id": 3825,
      "red": "四川 何静",
      "black": "北京 史思旋",
      "tournament": "",
      "date": "",
      "ply": 45
    }
  },
  {
    "book": "endgame",
    "lesson": 28,
    "tactic": "giaiHoa",
    "tone": "praise",
    "fen": "2ba1ab2/9/4k4/9/9/6B2/8n/4B4/4pK3/9 w",
    "move": "f1e1",
    "moveNotation": "Tg4-5",
    "game": {
      "id": 2937,
      "red": "吉林 陶汉明",
      "black": "黑龙江 于幼华",
      "tournament": "",
      "date": "",
      "ply": 177
    }
  },
  {
    "book": "endgame",
    "lesson": 30,
    "tactic": "xePhaoHopCong",
    "tone": "praise",
    "fen": "5k3/4a1N2/9/3R5/2p6/5r2C/4P3P/4B4/4A4/4KAB2 w",
    "move": "d6h6",
    "moveNotation": "X6-2",
    "game": {
      "id": 7701,
      "red": "黑龙江 郭莉萍",
      "black": "黑龙江 程思萌",
      "tournament": "",
      "date": "",
      "ply": 107
    }
  },
  {
    "book": "endgame",
    "lesson": 31,
    "tactic": "xeMaLanhChieu",
    "tone": "praise",
    "fen": "3a1k3/9/5a3/p3R2Np/5P3/P5B2/9/9/8r/c3KAB2 w",
    "move": "h6f7",
    "moveNotation": "M2.4",
    "game": {
      "id": 4511,
      "red": "湖北 柳大华",
      "black": "湖南 谢业枧",
      "tournament": "",
      "date": "",
      "ply": 125
    }
  },
  {
    "book": "endgame",
    "lesson": 31,
    "tactic": "xeMaLanhChieu",
    "tone": "praise",
    "fen": "3ak1b2/4a4/4b4/9/p8/9/P7r/2RnR4/1n1K5/9 b",
    "move": "i3i1",
    "moveNotation": "X9.2",
    "game": {
      "id": 532,
      "red": "杭州 陈建国",
      "black": "河北 苗利明",
      "tournament": "",
      "date": "",
      "ply": 186
    }
  },
  {
    "book": "endgame",
    "lesson": 31,
    "tactic": "xeMaLanhChieu",
    "tone": "praise",
    "fen": "5kb2/3Ra4/5a3/3N5/9/9/2rp5/9/4An3/3K1AB2 b",
    "move": "c3c0",
    "moveNotation": "X3.3",
    "game": {
      "id": 4291,
      "red": "江苏 杨伊",
      "black": "北京 唐丹",
      "tournament": "",
      "date": "",
      "ply": 164
    }
  },
  {
    "book": "endgame",
    "lesson": 32,
    "tactic": "xeChotPhaSiTuong",
    "tone": "praise",
    "fen": "3R2b2/4nk3/9/p7p/3P2nc1/6B2/P4p2P/9/4A4/2BAK4 w",
    "move": "d9g9",
    "moveNotation": "X6-3",
    "game": {
      "id": 551,
      "red": "上海浦东 董旭彬",
      "black": "福建 王晓华",
      "tournament": "",
      "date": "",
      "ply": 59
    }
  },
  {
    "book": "endgame",
    "lesson": 32,
    "tactic": "xeChotPhaSiTuong",
    "tone": "praise",
    "fen": "4kab2/4a4/b1R2c3/3P5/1c7/9/9/4B4/4A4/2BAK4 w",
    "move": "c7a7",
    "moveNotation": "X7-9",
    "game": {
      "id": 4232,
      "red": "浙江 邱东",
      "black": "四川 才溢",
      "tournament": "",
      "date": "",
      "ply": 97
    }
  },
  {
    "book": "endgame",
    "lesson": 32,
    "tactic": "xeChotPhaSiTuong",
    "tone": "praise",
    "fen": "3k1a3/1R2a4/2r1P4/3P5/9/9/6p2/4B4/4A4/2B1KA3 w",
    "move": "e7e8",
    "moveNotation": "B5.1",
    "game": {
      "id": 7155,
      "red": "河北金环钢构 苗利明",
      "black": "河南 武俊强",
      "tournament": "",
      "date": "",
      "ply": 91
    }
  },
  {
    "book": "endgame",
    "lesson": 35,
    "tactic": "maPhaoDoiMaPhao",
    "tone": "note",
    "fen": "4kab2/1N2a4/4bc3/8p/4Cn3/2P6/1p2N3P/4B4/4A4/2BAK4 b",
    "move": "f5e3",
    "moveNotation": "M6.5",
    "game": {
      "id": 9956,
      "red": "广东 吕钦",
      "black": "黑龙江 赵国荣",
      "tournament": "",
      "date": "",
      "ply": 60
    }
  },
  {
    "book": "endgame",
    "lesson": 35,
    "tactic": "maPhaoDoiMaPhao",
    "tone": "note",
    "fen": "4kab2/4a4/4b4/4P4/n4N2p/6P2/1R6P/B1C1BA3/9/1c2K4 b",
    "move": "a5b3",
    "moveNotation": "M1.2",
    "game": {
      "id": 10396,
      "red": "广东 吕钦",
      "black": "吉林 陶汉明",
      "tournament": "",
      "date": "",
      "ply": 94
    }
  },
  {
    "book": "endgame",
    "lesson": 35,
    "tactic": "maPhaoDoiMaPhao",
    "tone": "note",
    "fen": "C1ba5/3Nak3/9/2n2P3/8p/P3p2n1/3c5/4BA3/4A4/2B1K4 w",
    "move": "d8c6",
    "moveNotation": "M6/7",
    "game": {
      "id": 10671,
      "red": "湖北 柳大华",
      "black": "南方棋院 黄仕清",
      "tournament": "",
      "date": "",
      "ply": 81
    }
  },
  {
    "book": "endgame",
    "lesson": 37,
    "tactic": "maTotDoiPhaoTot",
    "tone": "note",
    "fen": "N1bak4/4a4/9/5P3/1P6p/2B6/4p4/5A3/3c1n3/2B2K3 w",
    "move": "f0f1",
    "moveNotation": "Tg4.1",
    "game": {
      "id": 10671,
      "red": "湖北 柳大华",
      "black": "南方棋院 黄仕清",
      "tournament": "",
      "date": "",
      "ply": 109
    }
  },
  {
    "book": "endgame",
    "lesson": 37,
    "tactic": "maTotDoiPhaoTot",
    "tone": "note",
    "fen": "3ak4/4a4/4b4/9/P3p1NP1/2B2p3/9/3AB4/9/3K1C1n1 b",
    "move": "e7g5",
    "moveNotation": "T5.7",
    "game": {
      "id": 8031,
      "red": "上海 林宏敏",
      "black": "武汉 熊学元",
      "tournament": "",
      "date": "",
      "ply": 86
    }
  },
  {
    "book": "endgame",
    "lesson": 37,
    "tactic": "maTotDoiPhaoTot",
    "tone": "note",
    "fen": "3ak1b2/4a4/4b4/9/8p/2B3P2/P7P/2nAB4/4A4/1R1CK4 b",
    "move": "c2b0",
    "moveNotation": "M3.2",
    "game": {
      "id": 8581,
      "red": "上海 万春林",
      "black": "云南 康宏",
      "tournament": "",
      "date": "",
      "ply": 90
    }
  },
  {
    "book": "endgame",
    "lesson": 38,
    "tactic": "tamAnhChienLuBo",
    "tone": "note",
    "fen": "2Ra1kb2/4N4/6n2/p7p/3P2nc1/6B2/P4p2P/9/4A4/2BAK4 b",
    "move": "g7e8",
    "moveNotation": "Ms/5",
    "game": {
      "id": 551,
      "red": "上海浦东 董旭彬",
      "black": "福建 王晓华",
      "tournament": "",
      "date": "",
      "ply": 56
    }
  },
  {
    "book": "endgame",
    "lesson": 38,
    "tactic": "tamAnhChienLuBo",
    "tone": "note",
    "fen": "2bakab2/9/9/p3c3p/2P1p4/9/P2r2P1P/4C4/4N4/C1BAKAB2 w",
    "move": "e2e6",
    "moveNotation": "P5.4",
    "game": {
      "id": 3825,
      "red": "四川 何静",
      "black": "北京 史思旋",
      "tournament": "",
      "date": "",
      "ply": 43
    }
  },
  {
    "book": "endgame",
    "lesson": 38,
    "tactic": "tamAnhChienLuBo",
    "tone": "note",
    "fen": "2bak4/4a4/C3b4/1Pp1C1p1p/5r3/2P1P4/6P1P/4B1N2/9/2BAKA1r1 w",
    "move": "g2h0",
    "moveNotation": "M3/2",
    "game": {
      "id": 8691,
      "red": "辽宁 李丛德",
      "black": "河北 黄勇",
      "tournament": "",
      "date": "",
      "ply": 41
    }
  },
  {
    "book": "endgame",
    "lesson": 42,
    "tactic": "xeMaDoiXeSongTuong",
    "tone": "note",
    "fen": "9/4k4/4b4/9/2b6/2R6/1r7/4pN3/9/2BAKA3 w",
    "move": "c0e2",
    "moveNotation": "T7.5",
    "game": {
      "id": 2861,
      "red": "重庆 许文学",
      "black": "天津 李智平",
      "tournament": "",
      "date": "",
      "ply": 133
    }
  },
  {
    "book": "middlegame",
    "lesson": 24,
    "tactic": "datDungViTri",
    "tone": "critique",
    "fen": "2b1ka3/4a4/n3b4/2p1pP2p/p8/2P1r4/P6R1/4B4/c1N1A2C1/2BAK4 w",
    "move": "h3b3",
    "moveNotation": "X2-8",
    "game": {
      "id": 2696,
      "red": "石化体协 崔岩",
      "black": "安徽 李冰",
      "tournament": "",
      "date": "",
      "ply": 65
    }
  }
];
