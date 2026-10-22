import fs from "node:fs";
import path from "node:path";
import { convertChineseGame } from "../src/lib/xiangqi/chinese-notation";
import { toFen, type Board, type Move } from "../src/lib/xiangqi/engine";
import { moveNotation } from "../src/lib/xiangqi/notation";
import {
  detectPalaceBreaker,
  detectSacrificeForInitiative,
  detectCounterThreat,
  detectFlankOverload,
  type ZhaoMiddlegameFact,
  type ZhaoTacticsOptions,
} from "../src/lib/xiangqi/middlegame";
import {
  detectInitiativeOverMaterial,
  detectPoisonedCapture,
  detectMatingRace,
  detectTempoChase,
  detectDecoy,
  detectInterference,
  detectCannonMount,
  detectTempoExchange,
  detectWorstPieceImprovement,
  detectFlankSwitch,
  detectProphylaxis,
  detectEndgameConversion,
  detectKhuyetSiSongXe,
  detectSmotheredCannonMate,
  detectNgoaTaoKnight,
  detectOaTamKnight,
  detectDeepCannonBottom,
  detectVoSuTienTotBien,
  detectMayUiTrungLo,
  detectNhatMaHoanLuongTuong,
  detectDoatTrungBinh,
  detectKhongTamPhao,
  detectThienDiaPhao,
  detectPhaoDayKhoaXe,
  detectOanhTacLoSuon,
  detectManhCongTuyenApDay,
  detectKiemCheDinhCung,
  detectChiemTuyenTot,
  detectKhongCheKyHa,
  detectTranhDoatLo3Lo7,
  detectPhongToaLoXe,
  detectTotBienDaiNao,
  detectSongXePhoiHop,
  detectPhaoGanh,
  detectLienHoanMa,
  detectXeMaPhaoTamTu,
  detectXeSongMa,
  detectXeSongPhao,
  detectXeMaLanhChieu,
  detectKheoPhaSiTuong,
  detectPheQuanPhaSiTuong,
  detectVayXe,
  detectVayPhao,
  detectMaPhungBienTatVong,
  detectVayMaGiac,
  detectTamNganThangTamXa,
  detectTamXaThangTamNgan,
  detectMotXeDoiHai,
  detectMotXeDoiBa,
  detectMaVanNhuLong,
  detectNhatXeThapTu,
  detectNgheThuatVanPhao,
  detectTieuBinhLapDaiCong,
  detectPheTotPhanCong,
  detectChienThuatMuuBinh,
  detectCucBoDiDaKichThieu,
  detectAllZhaoTactics,
} from "../src/lib/xiangqi/zhao-principles";

type DetectorFn = (before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions) => ZhaoMiddlegameFact | null;

interface DetectorDef {
  id: string;
  name: string;
  isNew?: boolean;
  fn: DetectorFn;
}

const DETECTORS: DetectorDef[] = [
  // Các bài kỳ lý Triệu Hâm Hâm
  { id: "khuyetSiSongXe", name: "Khuyết Sĩ kỵ Song Xe", isNew: true, fn: detectKhuyetSiSongXe },
  { id: "muonCungSat", name: "Muộn cung sát", isNew: true, fn: detectSmotheredCannonMate },
  { id: "ngoaTaoMa", name: "Mã Ngọa Tào", isNew: true, fn: detectNgoaTaoKnight },
  { id: "oaTamMa", name: "Oa Tâm Mã", isNew: true, fn: detectOaTamKnight },
  { id: "phaoTramDay", name: "Pháo trầm đáy", isNew: true, fn: detectDeepCannonBottom },
  { id: "voSuTienTotBien", name: "Vô sự tiến tốt biên", isNew: true, fn: detectVoSuTienTotBien },
  { id: "mayUiTrungLo", name: "Máy ủi trung lộ", isNew: true, fn: detectMayUiTrungLo },
  { id: "nhatMaHoanLuongTuong", name: "Nhất Mã hoán Lưỡng Tượng", isNew: true, fn: detectNhatMaHoanLuongTuong },
  { id: "doatTrungBinh", name: "Chiến thuật đoạt trung binh", isNew: true, fn: detectDoatTrungBinh },
  { id: "khongTamPhao", name: "Không tâm pháo", isNew: true, fn: detectKhongTamPhao },
  { id: "thienDiaPhao", name: "Thiên Địa Pháo", isNew: true, fn: detectThienDiaPhao },
  { id: "phaoDayKhoaXe", name: "Pháo đáy khóa Xe", isNew: true, fn: detectPhaoDayKhoaXe },
  { id: "oanhTacLoSuon", name: "Oanh tạc lộ sườn", isNew: true, fn: detectOanhTacLoSuon },
  { id: "manhCongTuyenApDay", name: "Mạnh công tuyến áp đáy", isNew: true, fn: detectManhCongTuyenApDay },
  { id: "kiemCheDinhCung", name: "Kiềm chế tuyến đỉnh cung", isNew: true, fn: detectKiemCheDinhCung },
  { id: "chiemTuyenTot", name: "Chiếm tuyến tốt", isNew: true, fn: detectChiemTuyenTot },
  { id: "khongCheKyHa", name: "Khống chế tuyến kỵ hà", isNew: true, fn: detectKhongCheKyHa },
  { id: "tranhDoatLo3Lo7", name: "Tranh đoạt lộ 3 và lộ 7", isNew: true, fn: detectTranhDoatLo3Lo7 },
  { id: "phongToaLoXe", name: "Phong tỏa lộ Xe", isNew: true, fn: detectPhongToaLoXe },
  { id: "totBienDaiNao", name: "Tốt biên đại náo", isNew: true, fn: detectTotBienDaiNao },
  { id: "songXePhoiHop", name: "Song Xe phối hợp", isNew: true, fn: detectSongXePhoiHop },
  { id: "phaoGanh", name: "Pháo gánh", isNew: true, fn: detectPhaoGanh },
  { id: "lienHoanMa", name: "Liên hoàn Mã", isNew: true, fn: detectLienHoanMa },
  { id: "xeMaPhaoTamTu", name: "Xe Mã Pháo tam tử", isNew: true, fn: detectXeMaPhaoTamTu },
  { id: "xeSongMa", name: "Xe Song Mã", isNew: true, fn: detectXeSongMa },
  { id: "xeSongPhao", name: "Xe Song Pháo", isNew: true, fn: detectXeSongPhao },
  { id: "xeMaLanhChieu", name: "Xe Mã lãnh chiêu", isNew: true, fn: detectXeMaLanhChieu },
  { id: "kheoPhaSiTuong", name: "Khéo phá Sĩ Tượng", isNew: true, fn: detectKheoPhaSiTuong },
  { id: "pheQuanPhaSiTuong", name: "Phế quân phá Sĩ Tượng", isNew: true, fn: detectPheQuanPhaSiTuong },
  { id: "vayXe", name: "Vây Xe", isNew: true, fn: detectVayXe },
  { id: "vayPhao", name: "Vây Pháo", isNew: true, fn: detectVayPhao },
  { id: "maPhungBienTatVong", name: "Mã phùng biên tất vong", isNew: true, fn: detectMaPhungBienTatVong },
  { id: "vayMaGiac", name: "Vây Mã Giác", isNew: true, fn: detectVayMaGiac },
  { id: "tamNganThangTamXa", name: "Vũ khí tầm ngắn thắng tầm xa", isNew: true, fn: detectTamNganThangTamXa },
  { id: "tamXaThangTamNgan", name: "Vũ khí tầm xa thắng tầm ngắn", isNew: true, fn: detectTamXaThangTamNgan },
  { id: "motXeDoiHai", name: "Một Xe đổi hai", isNew: true, fn: detectMotXeDoiHai },
  { id: "motXeDoiBa", name: "Một Xe đổi ba", isNew: true, fn: detectMotXeDoiBa },
  { id: "maVanNhuLong", name: "Mã vận như long", isNew: true, fn: detectMaVanNhuLong },
  { id: "nhatXeThapTu", name: "Nhất Xe thập tự", isNew: true, fn: detectNhatXeThapTu },
  { id: "ngheThuatVanPhao", name: "Nghệ thuật vận Pháo", isNew: true, fn: detectNgheThuatVanPhao },
  { id: "tieuBinhLapDaiCong", name: "Tiểu binh lập đại công", isNew: true, fn: detectTieuBinhLapDaiCong },
  { id: "pheTotPhanCong", name: "Phế Tốt phản công", isNew: true, fn: detectPheTotPhanCong },
  { id: "chienThuatMuuBinh", name: "Chiến thuật mưu Binh", isNew: true, fn: detectChienThuatMuuBinh },
  { id: "cucBoDiDaKichThieu", name: "Cục bộ dĩ đa kích thiểu", isNew: true, fn: detectCucBoDiDaKichThieu },

  // 16 bộ nhận diện hiện có / cơ bản
  { id: "tramSiPhaTuong", name: "Trảm Sĩ phá Tượng", fn: detectPalaceBreaker },
  { id: "khiTuTranhTien", name: "Khí tử tranh tiên", fn: detectSacrificeForInitiative },
  { id: "diCongViThu", name: "Dĩ công vi thủ", fn: detectCounterThreat },
  { id: "tuBinhDotKich", name: "Tụ binh đột kích", fn: detectFlankOverload },
  { id: "ninhThatNhatTu", name: "Ninh thất nhất tử", fn: detectInitiativeOverMaterial },
  { id: "khongThamAn", name: "Tham ăn mắc mồi", fn: detectPoisonedCapture },
  { id: "tranhNuoc", name: "Tranh nước đối công", fn: detectMatingRace },
  { id: "duoiQuanDuocTien", name: "Đuổi quân được tiên", fn: detectTempoChase },
  { id: "danDu", name: "Dẫn dụ", fn: detectDecoy },
  { id: "chanDuong", name: "Chặn đường", fn: detectInterference },
  { id: "giaPhao", name: "Giá Pháo", fn: detectCannonMount },
  { id: "doiQuanGianhTien", name: "Đổi quân giành tiên", fn: detectTempoExchange },
  { id: "caiThienQuanKem", name: "Cải thiện quân kém", fn: detectWorstPieceImprovement },
  { id: "thanhDongKichTay", name: "Thanh đông kích tây", fn: detectFlankSwitch },
  { id: "phongNgua", name: "Phòng ngừa", fn: detectProphylaxis },
  { id: "chuyenHoaTanCuoc", name: "Chuyển hóa tàn cuộc", fn: detectEndgameConversion },
];

interface TriggerInstance {
  gameid: number;
  players: string;
  result: string;
  ply: number;
  side: "r" | "b";
  moveVN: string;
  fenBefore: string;
  fenAfter: string;
  fact: ZhaoMiddlegameFact;
}

// PRNG mulberry32 với seed cố định
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function run() {
  const dataDir = path.resolve(__dirname, "..", ".data", "master-games");
  const files = fs.readdirSync(dataDir).filter((f) => f.startsWith("game_") && f.endsWith(".json"));

  console.log(`Đang phân tích ${files.length} ván đại sư trong ${dataDir}...`);

  const triggersByDetector = new Map<string, TriggerInstance[]>();
  for (const d of DETECTORS) {
    triggersByDetector.set(d.id, []);
  }
  const allZhaoTacticsTriggers: { tactic: string; instance: TriggerInstance }[] = [];

  let totalGames = 0;
  let totalPlies = 0;
  let skippedGames = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const rawMoves: string[] = content.moves_chinese ?? [];
    const conv = convertChineseGame(rawMoves);
    if (!conv.success || conv.moves.length < 2) {
      skippedGames++;
      continue;
    }

    totalGames++;
    const gameid = content.gameid ?? parseInt(file.replace(/\D/g, ""), 10);
    const players = `${content.red_player ?? "Đỏ"} vs ${content.black_player ?? "Đen"}`;
    const result = content.result ?? "unknown";

    const historyMoves: Move[] = [];

    for (let ply = 0; ply < conv.moves.length; ply++) {
      totalPlies++;
      const move = conv.moves[ply];
      const beforeBoard = conv.positions[ply].board;
      const afterBoard = conv.positions[ply + 1].board;
      const turn = conv.positions[ply].turn;
      const vnMove = conv.notations[ply];

      const options: ZhaoTacticsOptions = {
        loss: 0,
        recentMoves: historyMoves.slice(), pv: conv.moves.slice(ply + 1, ply + 5),
      };

      const fenBefore = toFen({ board: beforeBoard, turn });
      const fenAfter = toFen({ board: afterBoard, turn: turn === "r" ? "b" : "r" });

      // Chạy từng bộ riêng lẻ
      for (const d of DETECTORS) {
        try {
          const res = d.fn(beforeBoard, move, afterBoard, options);
          if (res) {
            triggersByDetector.get(d.id)!.push({
              gameid,
              players,
              result,
              ply: ply + 1,
              side: turn,
              moveVN: vnMove,
              fenBefore,
              fenAfter,
              fact: res,
            });
          }
        } catch (err) {
          console.error(`Lỗi tại detector ${d.id} game ${gameid} ply ${ply + 1}:`, err);
        }
      }

      // Chạy tổng hợp theo PRIORITY
      try {
        const facts = detectAllZhaoTactics(beforeBoard, move, afterBoard, options);
        for (const f of facts) {
          allZhaoTacticsTriggers.push({
            tactic: f.tactic,
            instance: {
              gameid,
              players,
              result,
              ply: ply + 1,
              side: turn,
              moveVN: vnMove,
              fenBefore,
              fenAfter,
              fact: f,
            },
          });
        }
      } catch (err) {
        console.error(`Lỗi tại detectAllZhaoTactics game ${gameid} ply ${ply + 1}:`, err);
      }

      historyMoves.push(move);
    }
  }

  console.log(`\nHoàn thành phân tích:`);
  console.log(`- Tổng số ván hợp lệ: ${totalGames} (bỏ qua ${skippedGames} ván lỗi/ngắn)`);
  console.log(`- Tổng số nước đi (plies): ${totalPlies}`);

  // Thống kê và lấy mẫu
  const rng = mulberry32(48); // Seed 48 (48 kỳ lý)
  const reportData: any = {
    totalGames,
    totalPlies,
    detectors: [],
  };

  console.log(`\n========================================================================================`);
  console.log(`BẢNG TẦN SUẤT KÍCH HOẠT CÁC BỘ NHẬN DIỆN KỲ LÝ TRIỆU HÂM HÂM`);
  console.log(`========================================================================================`);
  console.log(
    `| ${"Tên bộ nhận diện".padEnd(24)} | ${"Mã (Tactic)".padEnd(18)} | ${"Triggers".padStart(8)} | ${"Tần suất/100 nước".padStart(18)} | ${"Phân loại".padEnd(10)} |`
  );
  console.log(`|--------------------------|--------------------|----------|--------------------|------------|`);

  for (const d of DETECTORS) {
    const list = triggersByDetector.get(d.id)!;
    const count = list.length;
    const freqPer100 = (count / totalPlies) * 100;
    const tag = d.isNew ? "MỚI" : "HIỆN CÓ";

    console.log(
      `| ${d.name.padEnd(24)} | ${d.id.padEnd(18)} | ${count.toString().padStart(8)} | ${(freqPer100.toFixed(2) + "%").padStart(18)} | ${tag.padEnd(10)} |`
    );

    // Lấy 10 mẫu ngẫu nhiên (hoặc toàn bộ nếu < 10)
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const samples = shuffled.slice(0, 10);

    reportData.detectors.push({
      id: d.id,
      name: d.name,
      isNew: !!d.isNew,
      totalTriggers: count,
      freqPer100Moves: freqPer100,
      samples,
    });
  }
  console.log(`========================================================================================\n`);

  const outPath = path.join(dataDir, "zhao_detectors_audit.json");
  fs.writeFileSync(outPath, JSON.stringify(reportData, null, 2), "utf-8");
  console.log(`Đã xuất báo cáo chi tiết kèm mẫu kiểm tra ngẫu nhiên vào: ${outPath}`);
}

run().catch(console.error);
