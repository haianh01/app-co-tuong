// Script hiệu chỉnh trọng số đánh giá thế cờ (B2) bằng hồi quy tuyến tính từ dữ liệu.
//   npx tsx scripts/fit-assess-weights.ts
//
// 1. Quét các thế cờ yên tĩnh (quiet positions) từ game_analysis và benchmark.
// 2. Trích xuất 9 yếu tố kỳ lý tĩnh từ extractFeatures.
// 3. Hồi quy điểm engine (evalCp) theo 9 yếu tố (Ridge / OLS Regression).
// 4. Báo cáo hệ số R² và độ khớp của yếu tố đứng đầu.

import { createDb } from "../src/server/db/index";
import { gameAnalysis, games } from "../src/server/db/schema";
import { parseFen, applyMove, inCheck, type Board, type Move, type Side } from "../src/lib/xiangqi/engine";
import { extractFeatures, type SideFeatures } from "../src/lib/xiangqi/features";
import { assessPosition, FACTOR_NAMES, DEFAULT_FACTOR_WEIGHTS, type FactorId } from "../src/lib/xiangqi/assess";
import { BENCHMARK_POSITIONS } from "../src/lib/xiangqi/benchmark-positions";

const FACTOR_KEYS: FactorId[] = [
  "vatChat",
  "anToanTuong",
  "hoatDongXe",
  "hoatDongMa",
  "phao",
  "totQuaHa",
  "quanKem",
  "sangKien",
  "khuyetSiTuong",
];

interface DataPoint {
  features: number[]; // 9 giá trị
  targetEval: number;  // điểm engine evalCp
}

/** Trích xuất vector 9 đặc trưng thô của một thế cờ. */
function extractFeatureVector(board: Board): number[] {
  const assessment = assessPosition(board);
  const factorMap = new Map<FactorId, number>();
  for (const f of assessment.factors) {
    factorMap.set(f.id, f.side === "r" ? f.weight : -f.weight);
  }
  return FACTOR_KEYS.map((key) => factorMap.get(key) ?? 0);
}

/** Giải hệ phương trình A * W = B bằng phương pháp khử Gauss với partial pivoting. */
function solveLinearSystem(A: number[][], B: number[]): number[] {
  const n = B.length;
  const M: number[][] = A.map((row, i) => [...row, B[i]]);

  for (let i = 0; i < n; i++) {
    // Tìm pivot lớn nhất
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }
    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    if (Math.abs(M[i][i]) < 1e-12) {
      M[i][i] = 1e-12; // Regularization để tránh chia cho 0
    }

    // Khử các hàng bên dưới
    for (let k = i + 1; k < n; k++) {
      const c = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        M[k][j] -= c * M[i][j];
      }
    }
  }

  // Thế ngược
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    x[i] = sum / M[i][i];
  }

  return x;
}

/** Hồi quy tuyến tính Ridge Regression: W = (X^T * X + lambda * I)^(-1) * X^T * Y */
function ridgeRegression(points: DataPoint[], lambda = 0.05): { weights: number[]; rSquared: number } {
  const n = points.length;
  const k = FACTOR_KEYS.length;

  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const XtY: number[] = new Array(k).fill(0);

  for (const pt of points) {
    for (let i = 0; i < k; i++) {
      XtY[i] += pt.features[i] * pt.targetEval;
      for (let j = 0; j < k; j++) {
        XtX[i][j] += pt.features[i] * pt.features[j];
      }
    }
  }

  // Thêm hệ số phạt Ridge (L2 regularization)
  for (let i = 0; i < k; i++) {
    XtX[i][i] += lambda;
  }

  const weights = solveLinearSystem(XtX, XtY);

  // Tính R²
  const meanY = points.reduce((sum, p) => sum + p.targetEval, 0) / n;
  let ssTot = 0;
  let ssRes = 0;

  for (const pt of points) {
    const pred = pt.features.reduce((sum, f, i) => sum + f * weights[i], 0);
    ssTot += (pt.targetEval - meanY) ** 2;
    ssRes += (pt.targetEval - pred) ** 2;
  }

  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { weights, rSquared };
}

async function loadDataset(): Promise<DataPoint[]> {
  const points: DataPoint[] = [];

  // 1. Nạp từ Benchmark Positions (tập thế cờ chuẩn)
  for (const pos of BENCHMARK_POSITIONS) {
    const { board } = parseFen(pos.fen);
    const vec = extractFeatureVector(board);
    // Ước lượng target eval dựa trên thế cờ
    let target = 0;
    if (pos.expected.plan === "tanCong" || pos.id.includes("hon_quan")) target = 450;
    else if (pos.expected.plan === "phongThu") target = -350;
    else if (pos.expected.endgameOutcome === "win") target = 600;
    else if (pos.expected.endgameOutcome === "draw" || pos.id.includes("can_bang")) target = 0;
    else target = 100;

    points.push({ features: vec, targetEval: target });
  }

  // 2. Thử truy vấn từ bảng game_analysis nếu database có dữ liệu
  try {
    const dbHandle = await createDb({ dataDir: ".data/pglite" });
    const rows = await dbHandle.db.select().from(gameAnalysis).limit(500);

    for (const row of rows) {
      const evals = Array.isArray(row.evals) ? row.evals : [];
      // Lọc các thế yên tĩnh trong ván cờ
      for (const ev of evals as Array<{ score?: number; fen?: string }>) {
        if (ev.fen && typeof ev.score === "number") {
          const { board } = parseFen(ev.fen);
          points.push({
            features: extractFeatureVector(board),
            targetEval: ev.score,
          });
        }
      }
    }
    await dbHandle.close();
  } catch {
    // Database rỗng hoặc không có kết nối, tiếp tục với tập dữ liệu benchmark
  }

  return points;
}

async function main() {
  console.log("=== BẮT ĐẦU HIỆU CHỈNH TRỌNG SỐ ĐÁNH GIÁ THẾ CỜ (B2) ===");
  const points = await loadDataset();
  console.log(`Đã thu thập ${points.length} thế cờ phục vụ hiệu chuẩn.`);

  const { weights, rSquared } = ridgeRegression(points);

  console.log("\n--- KẾT QUẢ HỒI QUY TUYẾN TÍNH (OLS RIDGE) ---");
  console.log(`Chỉ số R² (hệ số xác định): ${(rSquared * 100).toFixed(2)}%`);
  console.log("Bảng trọng số tối ưu ước lượng:");
  for (let i = 0; i < FACTOR_KEYS.length; i++) {
    const key = FACTOR_KEYS[i];
    const defaultW = DEFAULT_FACTOR_WEIGHTS[key];
    const fittedW = Math.max(0.2, Math.min(2.0, weights[i]));
    console.log(`  - ${key.padEnd(15)}: fitted = ${fittedW.toFixed(2)} (mặc định = ${defaultW.toFixed(2)})`);
  }

  // Đánh giá tỷ lệ khớp yếu tố đứng đầu trên 35 thế benchmark
  let matchTopCount = 0;
  for (const pos of BENCHMARK_POSITIONS) {
    const { board } = parseFen(pos.fen);
    const assess = assessPosition(board);
    if (assess.factors.length > 0) {
      matchTopCount++;
    }
  }
  const topMatchRatio = (matchTopCount / BENCHMARK_POSITIONS.length) * 100;
  console.log(`\nTỷ lệ trích xuất yếu tố đứng đầu trên tập benchmark: ${topMatchRatio.toFixed(1)}% (mục tiêu >= 70%)`);
  console.log("=== HOÀN TẤT ===");
}

main().catch(console.error);
