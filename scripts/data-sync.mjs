// Đồng bộ dữ liệu nghiên cứu (không nằm trên repo code vì có bản quyền / quá lớn) với một repo GitHub RIÊNG TƯ.
//
// Repo phụ dùng git dir riêng `.data-repo.git`, cây làm việc là thư mục dự án, và CHỈ theo dõi các thư mục trong PATHS.
// Repo code (công khai) không thấy gì vì các thư mục này đã nằm trong .gitignore.
//
//   npm run data:status            — xem khác biệt giữa máy này và lần đồng bộ cuối
//   npm run data:push [-- -m "…"]  — gửi dữ liệu máy này lên repo riêng tư
//   npm run data:push -- --mine    — như trên, file bị sửa ở cả hai máy thì giữ bản của máy này
//   npm run data:pull [-- --force] — lấy dữ liệu về (máy mới: chạy lệnh này sau `npm ci`)
//
// Địa chỉ repo đặt trong .env: DATA_REPO_URL=git@github.com:<tên>/<repo-riêng-tư>.git

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

/** Thư mục được đồng bộ. Không có DB (.data/pglite) và engine (tải lại bằng scripts/fetch-engine.sh). */
const PATHS = ["data", ".data/audit-cache", ".data/puzzle-mining", ".data/expert-commentary"];
const GIT_DIR = path.join(process.cwd(), ".data-repo.git");
const BRANCH = "main";

const args = process.argv.slice(2);
const cmd = args[0];
const force = args.includes("--force");
const mine = args.includes("--mine");
const msgIdx = args.indexOf("-m");
const message = msgIdx >= 0 ? args[msgIdx + 1] : `Đồng bộ dữ liệu ${new Date().toLocaleString("sv-SE").slice(0, 16)}`;

function git(gitArgs, { allowFail = false, quiet = false } = {}) {
  const r = spawnSync("git", ["--git-dir", GIT_DIR, "--work-tree", process.cwd(), ...gitArgs], {
    encoding: "utf8",
    stdio: quiet ? "pipe" : ["inherit", "pipe", "inherit"],
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) {
    console.error("Lỗi: không chạy được git:", r.error.message);
    process.exit(1);
  }
  if (r.status !== 0 && !allowFail) {
    if (quiet && r.stderr) console.error(r.stderr.trim());
    console.error(`Lỗi: git ${gitArgs[0]} thất bại (mã ${r.status}).`);
    process.exit(r.status ?? 1);
  }
  return { ok: r.status === 0, out: (r.stdout ?? "").trim() };
}

const existing = () => PATHS.filter((p) => existsSync(path.join(process.cwd(), p)));

function ensureRepo() {
  const url = process.env.DATA_REPO_URL;
  if (!existsSync(GIT_DIR)) {
    if (!url) {
      console.error("Lỗi: chưa có DATA_REPO_URL trong .env (vd. git@github.com:<tên>/app-co-tuong-data.git).");
      process.exit(1);
    }
    // init không nhận --work-tree nên chạy riêng
    const r = spawnSync("git", ["init", "--bare", "--quiet", `--initial-branch=${BRANCH}`, GIT_DIR], { stdio: "inherit" });
    if (r.status !== 0) {
      console.error("Lỗi: không tạo được .data-repo.git");
      process.exit(1);
    }
    git(["remote", "add", "origin", url]);
  } else if (url) {
    git(["remote", "set-url", "origin", url]);
  }
  // Dữ liệu là kỳ phổ / JSON: giữ nguyên byte, không đổi xuống dòng theo Windows
  git(["config", "core.autocrlf", "false"]);
  git(["config", "core.bare", "false"]);
  // Người commit: lấy theo repo code nếu repo dữ liệu chưa có (máy không đặt user.name / user.email toàn cục)
  for (const key of ["user.name", "user.email"]) {
    if (git(["config", "--get", key], { allowFail: true, quiet: true }).ok) continue;
    const r = spawnSync("git", ["config", "--get", key], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) git(["config", key, r.stdout.trim()]);
  }
}

/** Thay đổi so với lần đồng bộ cuối (kể cả file mới bị .gitignore của repo code che). */
function pendingChanges() {
  const paths = existing();
  if (!paths.length) return [];
  const out = git(["add", "--dry-run", "-A", "-f", "--", ...paths], { quiet: true }).out;
  return out ? out.split("\n") : [];
}

const hasCommit = () => git(["rev-parse", "--verify", "--quiet", "HEAD"], { allowFail: true, quiet: true }).ok;

function remoteHasBranch() {
  return git(["ls-remote", "--heads", "origin", BRANCH], { quiet: true }).out.length > 0;
}

/** Số lần lưu (commit) trên máy này chưa có trên repo, theo lần fetch gần nhất. */
function unpushed() {
  if (!hasCommit()) return 0;
  const hasRemoteRef = git(["rev-parse", "--verify", "--quiet", `origin/${BRANCH}`], { allowFail: true, quiet: true }).ok;
  const range = hasRemoteRef ? `origin/${BRANCH}..HEAD` : "HEAD";
  return Number(git(["rev-list", "--count", range], { quiet: true }).out);
}

function status() {
  ensureRepo();
  if (remoteHasBranch()) git(["fetch", "--quiet", "origin", BRANCH]);
  const changes = pendingChanges();
  const ahead = unpushed();
  console.log(`Thư mục đồng bộ: ${PATHS.join(", ")}`);
  console.log(`Có trên máy này: ${existing().join(", ") || "(chưa có)"}`);
  console.log(hasCommit() ? `Lần đồng bộ cuối: ${git(["log", "-1", "--format=%cd — %s", "--date=iso"], { quiet: true }).out}` : "Chưa đồng bộ lần nào.");
  console.log(changes.length ? `${changes.length} thay đổi chưa gửi, vd.:\n  ${changes.slice(0, 10).join("\n  ")}` : "Không có thay đổi chưa gửi.");
  if (ahead) console.log(`${ahead} lần lưu trên máy này chưa lên repo, chạy \`npm run data:push\`.`);
}

function push() {
  ensureRepo();
  const paths = existing();
  if (!paths.length) {
    console.error("Lỗi: máy này không có thư mục dữ liệu nào để gửi.");
    process.exit(1);
  }
  // Máy đã có dữ liệu trên repo nhưng chưa từng kéo về: phải pull trước để không ghi đè lịch sử
  if (!hasCommit() && remoteHasBranch()) {
    console.error("Lỗi: repo riêng tư đã có dữ liệu. Chạy `npm run data:pull` trước rồi mới push.");
    process.exit(1);
  }
  git(["add", "-A", "-f", "--", ...paths]);
  const staged = git(["diff", "--cached", "--name-only"], { quiet: true }).out;
  if (!staged) {
    console.log("Không có thay đổi để gửi.");
  } else {
    console.log(`Gửi ${staged.split("\n").length} file thay đổi…`);
    git(["commit", "--quiet", "-m", message]);
  }
  // Máy khác đã gửi bản mới hơn: đặt thay đổi của máy này lên trên bản đó (đổi cùng một file ở hai máy thì dừng để người dùng chọn)
  if (remoteHasBranch()) {
    git(["fetch", "--quiet", "origin", BRANCH]);
    const behind = !git(["merge-base", "--is-ancestor", `origin/${BRANCH}`, "HEAD"], { allowFail: true, quiet: true }).ok;
    if (behind) {
      console.log("Repo có bản mới hơn từ máy khác, đang ghép…");
      // Khi rebase, "theirs" là commit của máy này đang được đặt lại lên trên
      const strategy = mine ? ["-X", "theirs"] : [];
      if (!git(["rebase", "--quiet", ...strategy, `origin/${BRANCH}`], { allowFail: true, quiet: true }).ok) {
        const conflicts = git(["diff", "--name-only", "--diff-filter=U"], { allowFail: true, quiet: true }).out;
        git(["rebase", "--abort"], { allowFail: true, quiet: true });
        console.error(`Dừng: các file sau bị sửa ở cả hai máy:\n  ${conflicts.split("\n").join("\n  ")}`);
        console.error("Chọn một trong hai:");
        console.error("  giữ bản của máy này:  npm run data:push -- --mine");
        console.error("  lấy bản trên repo:    npm run data:pull -- --force  (bỏ thay đổi của máy này)");
        process.exit(1);
      }
    }
  }
  git(["push", "--quiet", "origin", `${BRANCH}:${BRANCH}`]);
  console.log("Đã đồng bộ lên repo riêng tư.");
}

function pull() {
  ensureRepo();
  if (!remoteHasBranch()) {
    console.error("Repo riêng tư chưa có dữ liệu. Ở máy đang có dữ liệu, chạy `npm run data:push` trước.");
    process.exit(1);
  }
  git(["fetch", "--quiet", "origin", BRANCH]);
  if (hasCommit()) {
    const changes = pendingChanges();
    const ahead = unpushed();
    if ((changes.length || ahead) && !force) {
      console.error(`Dừng: máy này có dữ liệu chưa gửi (${changes.length} file thay đổi, ${ahead} lần lưu chưa lên repo).`);
      if (changes.length) console.error(`  ${changes.slice(0, 10).join("\n  ")}`);
      console.error("Gửi trước bằng `npm run data:push`, hoặc chạy `npm run data:pull -- --force` để ghi đè bằng bản trên repo.");
      process.exit(1);
    }
    git(["reset", "--quiet", "--hard", `origin/${BRANCH}`]);
  } else {
    // Máy mới: thư mục dữ liệu có sẵn trùng tên thì chỉ ghi đè khi có --force
    if (existing().length && !force) {
      console.error(`Dừng: máy này đã có ${existing().join(", ")} nhưng chưa từng đồng bộ.`);
      console.error("Chạy `npm run data:pull -- --force` để ghi đè bằng bản trên repo (file chỉ có ở máy này được giữ nguyên).");
      process.exit(1);
    }
    git(["checkout", "--quiet", "-f", "-B", BRANCH, `origin/${BRANCH}`]);
  }
  console.log(`Đã lấy dữ liệu: ${git(["log", "-1", "--format=%cd — %s", "--date=iso"], { quiet: true }).out}`);
}

if (cmd === "status") status();
else if (cmd === "push") push();
else if (cmd === "pull") pull();
else {
  console.error("Dùng: node scripts/data-sync.mjs <status|push|pull> [-m \"lời nhắn\"] [--force]");
  process.exit(1);
}
