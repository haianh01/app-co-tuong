import fs from "node:fs";
import path from "node:path";
import { convertChineseGame } from "../src/lib/xiangqi/chinese-notation";
import { detectOpeningFromMoves, getOpeningGuide } from "../src/lib/xiangqi/openings";

const dataDir = path.join(process.cwd(), ".data", "master-games");
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith("game_") && f.endsWith(".json"));

console.log(`Analyzing opening detection across ${files.length} master games...\n`);

interface OpeningComparison {
  gameid: number;
  eccoCode: string;
  eccoName: string;
  detectedName: string;
  guidePliesMatched: number;
  firstMoveVN: string;
  first2MovesVN: string;
  matchStatus: "exact" | "category_match" | "generic_fallback" | "unrecognized";
}

const results: OpeningComparison[] = [];
let categoryMatches = 0;
let genericFallbacks = 0;
let exactMatches = 0;

for (const file of files) {
  const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"));
  const rawMoves = content.moves_chinese ?? [];
  const conv = convertChineseGame(rawMoves);
  if (!conv.success) continue;

  const notations = conv.notations;
  const guide = getOpeningGuide(notations);
  const detected = guide?.name ?? detectOpeningFromMoves(notations) ?? "Không nhận diện";

  const eccoCode = content.ecco_code ?? "";
  const eccoName = content.ecco_name ?? "";

  // Check matching quality
  const eccoNorm = eccoName.toLowerCase();
  const detNorm = detected.toLowerCase();

  let status: OpeningComparison["matchStatus"] = "unrecognized";
  if (detNorm === eccoNorm) {
    status = "exact";
    exactMatches++;
  } else if (
    (eccoNorm.includes("中炮") && (detNorm.includes("pháo đầu") || detNorm.includes("trung pháo"))) ||
    (eccoNorm.includes("仙人指路") && detNorm.includes("tiên nhân chỉ lộ")) ||
    (eccoNorm.includes("飞相") && detNorm.includes("phi tượng")) ||
    (eccoNorm.includes("起马") && detNorm.includes("khởi mã")) ||
    (eccoNorm.includes("过宫炮") && detNorm.includes("quá cung")) ||
    (eccoNorm.includes("士角炮") && detNorm.includes("sĩ giác"))
  ) {
    status = "category_match";
    categoryMatches++;
  } else if (detNorm.includes("khai cuộc khác") || detNorm === "pháo khác" || detNorm === "khai cuộc") {
    status = "generic_fallback";
    genericFallbacks++;
  }

  results.push({
    gameid: content.gameid,
    eccoCode,
    eccoName,
    detectedName: detected,
    guidePliesMatched: guide?.pliesMatched ?? 0,
    firstMoveVN: notations[0] ?? "",
    first2MovesVN: notations.slice(0, 2).join(" "),
    matchStatus: status,
  });
}

console.log("============================================================");
console.log("TỔNG KẾT ĐỐI CHIẾU KHAI CUỘC");
console.log("============================================================");
console.log(`Tổng số ván phân tích: ${results.length}`);
console.log(`Khớp hệ / chủng loại khai cuộc: ${categoryMatches} (${Math.round((categoryMatches / results.length) * 100)}%)`);
console.log(`Bị rơi vào fallback chung chung: ${genericFallbacks} (${Math.round((genericFallbacks / results.length) * 100)}%)`);

// Nhóm các ECCO code hay gặp nhất nhưng openings.ts chưa có biến sâu (guidePliesMatched <= 2)
const shallowByEcco = new Map<string, { count: number; name: string; sampleGame: number; firstMoves: string }>();
for (const r of results) {
  if (r.guidePliesMatched <= 2 && r.eccoCode) {
    const cur = shallowByEcco.get(r.eccoCode) ?? {
      count: 0,
      name: r.eccoName,
      sampleGame: r.gameid,
      firstMoves: r.first2MovesVN,
    };
    cur.count++;
    shallowByEcco.set(r.eccoCode, cur);
  }
}

console.log("\nCác mã ECCO phổ biến mà openings.ts chưa nhận diện sâu (chỉ match 1-2 nước đầu):");
const sortedShallow = [...shallowByEcco.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 15);
for (const [code, info] of sortedShallow) {
  console.log(`  - [${code}] ${info.name}: ${info.count} ván (Nước đầu: ${info.firstMoves})`);
}

// Ghi kết quả so sánh ra file JSON để làm báo cáo
fs.writeFileSync(
  path.join(dataDir, "openings_comparison_report.json"),
  JSON.stringify(
    {
      totalGames: results.length,
      categoryMatchPct: Math.round((categoryMatches / results.length) * 100),
      genericFallbackPct: Math.round((genericFallbacks / results.length) * 100),
      topMissingEccoLines: sortedShallow,
      details: results.slice(0, 30),
    },
    null,
    2
  )
);
console.log(`\nĐã lưu chi tiết vào: ${path.join(dataDir, "openings_comparison_report.json")}`);
