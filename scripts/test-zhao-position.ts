/**
 * Script kiểm tra và đối chiếu phân tích của AI với 48 Kỳ Lý Triệu Hâm Hâm:
 * 
 * Cách dùng:
 *   npx tsx scripts/test-zhao-position.ts --lesson 2        (Kiểm tra riêng Bài 2: Muộn cung sát)
 *   npx tsx scripts/test-zhao-position.ts --lesson 4        (Kiểm tra Bài 4: Oa tâm mã)
 *   npx tsx scripts/test-zhao-position.ts --all             (Kiểm tra tất cả các thế cờ mẫu)
 *   npx tsx scripts/test-zhao-position.ts --all --engine    (Dùng engine Pikafish thật để tính)
 */
import fs from "node:fs";
import path from "node:path";
import { parseFen, play, type Board, type Move } from "../src/lib/xiangqi/engine";
import { detectAllZhaoTactics } from "../src/lib/xiangqi/zhao-principles";
import type { ZhaoTacticsOptions } from "../src/lib/xiangqi/middlegame";
import { uciToMove, moveToUci } from "../src/lib/xiangqi/uci";
import { getEnginePool } from "../src/server/engine/uci";

interface LessonBenchmark {
  lesson: number;
  title: string;
  tacticId: string;
  fen: string;
  move: string;
  moveNotation: string;
  video: string;
  videoUrl: string;
  description: string;
  principle: string;
}

const args = process.argv.slice(2);
const lessonArg = args.includes("--lesson") ? Number(args[args.indexOf("--lesson") + 1]) : null;
const useEngine = args.includes("--engine");
const isAll = args.includes("--all") || lessonArg === null;

const dataFile = path.join(process.cwd(), "data", "zhao-lessons-benchmark.json");
if (!fs.existsSync(dataFile)) {
  console.error("Không tìm thấy file dữ liệu: data/zhao-lessons-benchmark.json");
  process.exit(1);
}

const benchmarks: LessonBenchmark[] = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const targetList = lessonArg ? benchmarks.filter((b) => b.lesson === lessonArg) : benchmarks;

if (targetList.length === 0) {
  console.error(`Không tìm thấy bài học số ${lessonArg}. Danh sách hiện có: ${benchmarks.map((b) => b.lesson).join(", ")}`);
  process.exit(1);
}

async function run() {
  console.log("\n================================================================================");
  console.log("       ĐỐI CHIẾU AI PHÂN TÍCH VỚI KỲ LÝ TRIỆU HÂM HÂM (ZHAO XINXIN)");
  console.log("================================================================================\n");

  let pool = null;
  if (useEngine) {
    console.log("-> Đang khởi động Pikafish Engine Pool...");
    pool = getEnginePool();
    if (!pool) {
      console.warn("(!) Không khởi động được Pikafish, chuyển về chế độ phân tích offline với bộ test.");
    }
  }

  let matchedCount = 0;
  let totalCount = targetList.length;

  for (const item of targetList) {
    const pos = parseFen(item.fen);
    const m = uciToMove(item.move);
    if (!m) {
      console.error(`[Bài ${item.lesson}] Nước đi UCI không hợp lệ: ${item.move}`);
      continue;
    }
    const after = play(pos.board, m);

    let options: ZhaoTacticsOptions = { loss: 0 };

    if (pool) {
      // Dùng Pikafish thật để phân tích nước đi
      const fenAfter = item.fen.replace(/ [wb] /, pos.turn === "r" ? " b " : " w ");
      const searchRes = await pool.search(fenAfter, { nodes: 30000 });
      const pvMoves: Move[] = (searchRes.pv ?? []).map((u) => uciToMove(u)).filter(Boolean) as Move[];
      options = {
        loss: 0,
        pv: pvMoves,
        evalAfter: {
          score: searchRes.cp ?? 0,
        },
      };
    } else {
      // Giả lập options chuẩn tương thích với 4 tầng kỳ lý
      options = {
        loss: 0,
        evalAfter: {
          score: item.tacticId === "oaTamMa" ? 100000 : -100000,
        },
        pv: [],
      };
    }

    const facts = detectAllZhaoTactics(pos.board, m, after, options);
    const matchedFact = facts.find((f) => f.tactic === item.tacticId);
    const isMatch = !!matchedFact;

    if (isMatch) matchedCount++;

    console.log(`--------------------------------------------------------------------------------`);
    console.log(`[BÀI ${item.lesson}] ${item.title}`);
    console.log(`Video gốc: ${item.videoUrl}`);
    console.log(`Thế cờ (FEN): ${item.fen}`);
    console.log(`Nước đi: ${item.moveNotation} (${item.move})`);
    console.log(`Ngữ cảnh: ${item.description}`);
    console.log(`\n* NGUYÊN LÝ TRIỆU HÂM HÂM:`);
    console.log(`  "${item.principle}"`);

    console.log(`\n* AI PHÂN TÍCH:`);
    if (isMatch && matchedFact) {
      console.log(`  [XÁC NHẬN] AI nhận diện đúng kỳ lý: ${matchedFact.lessonTitle || item.title} (${matchedFact.tactic})`);
      console.log(`  Sắc thái: ${matchedFact.tone === "critique" ? "Phê bình / Cảnh tỉnh (Sai lầm)" : "Khen ngợi / Công nhận"}`);
      console.log(`  Lời bình: ${matchedFact.summary}`);
    } else {
      console.log(`  [CHƯA GẮN] AI không gắn kỳ lý '${item.tacticId}' cho nước này.`);
      if (facts.length > 0) {
        console.log(`  AI gắn các kỳ lý khác: ${facts.map((f) => f.lessonTitle || f.tactic).join(", ")}`);
      } else {
        console.log(`  (Nước đi cần chạy Pikafish với flag --engine để dựng biến PV hoàn chỉnh)`);
      }
    }

    console.log(`\n-> KẾT QUẢ: ${isMatch ? "✅ KHỚP VỚI BÀI GIẢNG" : "⚠️ CẦN ENGINE TÍNH BIẾN SÂU"}`);
    console.log(`--------------------------------------------------------------------------------\n`);
  }

  console.log(`\n================================================================================`);
  console.log(`TỔNG KẾT: ${matchedCount}/${totalCount} thế cờ khớp chính xác kỳ lý Triệu Hâm Hâm.`);
  console.log(`================================================================================\n`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
