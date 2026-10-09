// Sinh favicon, icon, ảnh xem trước (OG) từ HTML bằng trình duyệt headless.
// Chạy lại sau khi đổi tên thương hiệu:  node scripts/generate-brand-assets.mjs
// (đặt PW_CHANNEL=msedge hoặc chrome để dùng trình duyệt có sẵn trên máy)

import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BRAND = process.env.BRAND_NAME ?? "Kỳ Đài";
const FONTS =
  '<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@500;700&family=Noto+Serif:wght@700&family=Noto+Serif+SC:wght@900&display=block" rel="stylesheet">';

const seal = (size) => `
<div style="width:${size}px;height:${size}px;border-radius:${size * 0.2}px;background:#a3221b;display:grid;place-items:center">
  <span style="font-family:'Noto Serif SC';font-weight:900;font-size:${size * 0.72}px;line-height:1;color:#fff4e0;transform:translateY(-${size * 0.02}px)">帥</span>
</div>`;

const piece = (size, bg = "#16110e") => `
<div style="width:${size}px;height:${size}px;background:${bg};display:grid;place-items:center">
  <div style="width:${size * 0.92}px;height:${size * 0.92}px;border-radius:50%;background:#f3dfb6;border:${size * 0.035}px solid #b3261e;box-shadow:0 ${size * 0.03}px 0 #9c7a4a;display:grid;place-items:center">
    <div style="width:${size * 0.74}px;height:${size * 0.74}px;border-radius:50%;border:${size * 0.012}px solid #b3261e;display:grid;place-items:center">
      <span style="font-family:'Noto Serif SC';font-weight:900;font-size:${size * 0.5}px;line-height:1;color:#b3261e">帥</span>
    </div>
  </div>
</div>`;

const ogPiece = (ch, red, x, y, s = 132) => `
<div style="position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:50%;background:#f3dfb6;border:4px solid ${red ? "#b3261e" : "#1e1915"};box-shadow:0 6px 0 #9c7a4a,0 14px 24px rgba(0,0,0,.45);display:grid;place-items:center">
  <div style="width:${s * 0.8}px;height:${s * 0.8}px;border-radius:50%;border:2px solid ${red ? "#b3261e" : "#1e1915"};display:grid;place-items:center;font-family:'Noto Serif SC';font-weight:900;font-size:${s * 0.48}px;color:${red ? "#b3261e" : "#1e1915"}">${ch}</div>
</div>`;

const og = `
<div style="width:1200px;height:630px;background:#16110e;position:relative;overflow:hidden;font-family:'Be Vietnam Pro'">
  <div style="position:absolute;right:-40px;top:-60px;font-family:'Noto Serif SC';font-weight:900;font-size:520px;line-height:1;color:rgba(233,200,142,.05)">象棋</div>
  <div style="position:absolute;left:80px;top:150px;display:flex;flex-direction:column;gap:22px;width:600px">
    <div style="display:flex;align-items:center;gap:22px">${seal(96)}<span style="font-family:'Noto Serif';font-weight:700;font-size:84px;color:#f4e9d8">${BRAND}</span></div>
    <div style="font-family:'Noto Serif';font-weight:700;font-size:54px;color:#e6b65a">Cờ tướng online</div>
    <div style="font-size:30px;color:#c9b79e;line-height:1.5">Đấu xếp hạng với người thật · Chơi với máy · Giải cờ thế</div>
  </div>
  <div style="position:absolute;right:70px;top:70px;width:470px;height:490px;border-radius:24px;background:#e9c88e;box-shadow:0 0 0 16px #6e3f1c">
    ${ogPiece("車", false, 40, 40)}${ogPiece("將", false, 300, 40)}
    ${ogPiece("炮", true, 40, 300)}${ogPiece("帥", true, 300, 300)}
    ${ogPiece("馬", false, 170, 170, 120)}
  </div>
</div>`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage();

async function shot(html, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>body{margin:0;background:transparent}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
}

/** Gói nhiều ảnh PNG thành một file .ico (định dạng ICO cho phép nhúng PNG). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const favicons = [];
for (const size of [16, 32, 48]) favicons.push({ size, data: await shot(seal(size), size, size) });
writeFileSync("src/app/favicon.ico", ico(favicons));
writeFileSync("src/app/icon.png", await shot(seal(512), 512, 512));
writeFileSync("src/app/apple-icon.png", await shot(piece(180, "#a3221b"), 180, 180));
writeFileSync("public/og.png", await shot(og, 1200, 630));
await browser.close();
console.log("Đã tạo: src/app/favicon.ico, src/app/icon.png, src/app/apple-icon.png, public/og.png");
