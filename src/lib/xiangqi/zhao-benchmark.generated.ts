// Sinh tự động bởi scripts/build-zhao-benchmark.ts — không sửa tay.
// Thế cờ trong ván đại sư (MASTER_GAMES) mà kỳ lý của bài được biến Pikafish xác nhận, kể cả khi chấm lại như modal.

export interface ZhaoBenchmarkRow {
  lesson: number;
  tactic: string;
  tone: "praise" | "critique";
  fen: string;
  move: string;
  moveNotation: string;
  game: { id: number; red: string; black: string; tournament: string; date: string; ply: number };
}

export const ZHAO_BENCHMARK_ROWS: ZhaoBenchmarkRow[] = [
  {
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
    "lesson": 5,
    "tactic": "chuyenHoaTanCuoc",
    "tone": "praise",
    "fen": "3a1k3/4a4/9/7RC/2b6/6B2/8P/3K5/2c2r3/6B1c b",
    "move": "i0i6",
    "moveNotation": "P9/6",
    "game": {
      "id": 1266,
      "red": "天津 张申宏",
      "black": "四川 李艾东",
      "tournament": "",
      "date": "",
      "ply": 84
    }
  },
  {
    "lesson": 5,
    "tactic": "chuyenHoaTanCuoc",
    "tone": "praise",
    "fen": "2b2k3/3Pa4/b4a3/3R5/9/4c1p2/pn3r2C/1C2B1N2/4A4/2B1KA3 w",
    "move": "i3b3",
    "moveNotation": "P1-8",
    "game": {
      "id": 2861,
      "red": "重庆 许文学",
      "black": "天津 李智平",
      "tournament": "",
      "date": "",
      "ply": 105
    }
  },
  {
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
    "lesson": 17,
    "tactic": "manhCongTuyenApDay",
    "tone": "praise",
    "fen": "4kab2/4a1c2/2R1b4/9/9/3n2PNC/P1C1P3P/3AB4/4K4/cr3AB2 b",
    "move": "b0b1",
    "moveNotation": "X2/1",
    "game": {
      "id": 1211,
      "red": "山东 谢岿",
      "black": "江苏 徐天红",
      "tournament": "",
      "date": "",
      "ply": 64
    }
  },
  {
    "lesson": 17,
    "tactic": "manhCongTuyenApDay",
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
    "lesson": 21,
    "tactic": "tranhDoatLo3Lo7",
    "tone": "praise",
    "fen": "2nak1b2/4a4/4b1n2/p1N5p/5c3/5R3/P1P4rP/N3C4/4A4/2B1KAB2 w",
    "move": "f4g4",
    "moveNotation": "X4-3",
    "game": {
      "id": 9571,
      "red": "云南 陈信安",
      "black": "江西 刘军",
      "tournament": "",
      "date": "",
      "ply": 49
    }
  },
  {
    "lesson": 28,
    "tactic": "xeMaPhaoTamTu",
    "tone": "praise",
    "fen": "4kab2/4a1c2/2R1b4/9/9/6PNC/P1C1P3P/4B4/2nKA4/cr3AB2 b",
    "move": "a0a1",
    "moveNotation": "P1/1",
    "game": {
      "id": 1211,
      "red": "山东 谢岿",
      "black": "江苏 徐天红",
      "tournament": "",
      "date": "",
      "ply": 72
    }
  },
  {
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
    "lesson": 46,
    "tactic": "pheTotPhanCong",
    "tone": "praise",
    "fen": "2baka3/9/c3c1n1b/2p3C1p/4P4/2P4R1/P1r3P1P/2n1BCN2/4A4/2BAK4 w",
    "move": "e5e6",
    "moveNotation": "B5.1",
    "game": {
      "id": 6381,
      "red": "青海 马星",
      "black": "天津 刘智",
      "tournament": "",
      "date": "",
      "ply": 35
    }
  },
  {
    "lesson": 46,
    "tactic": "pheTotPhanCong",
    "tone": "praise",
    "fen": "4kab2/4a4/4b3n/pC1r5/2pn4p/1R1R5/P1P5P/9/4K4/5A2c b",
    "move": "c5c4",
    "moveNotation": "B3.1",
    "game": {
      "id": 6656,
      "red": "辽宁 陈卓",
      "black": "浙江 谢丹枫",
      "tournament": "",
      "date": "",
      "ply": 72
    }
  },
  {
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
  }
];
