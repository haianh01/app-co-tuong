import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, OPTIONS, POST, decodeBase64Text } from "./route";

describe("ziga-relay API route", () => {
  it("trả về header CORS cho OPTIONS", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("nhận gói tin POST và bóc tách thành công", async () => {
    const req = new NextRequest("http://localhost:3000/api/tuong-thuat/ziga-relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: "in",
        payload: '42["game_move",{"from":70,"to":67}]',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.parsed.move).toEqual({ from: 70, to: 67 });
  });

  it("giải mã payload base64 (WebSocket binary) trước khi bóc tách", async () => {
    const text = '42["game_move",{"from":70,"to":67}]';
    const req = new NextRequest("http://localhost:3000/api/tuong-thuat/ziga-relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: "in",
        encoding: "base64",
        payload: Buffer.from(text, "utf-8").toString("base64"),
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.parsed.move).toEqual({ from: 70, to: 67 });
  });

  it("giữ nguyên base64 khi binary không phải UTF-8", () => {
    expect(decodeBase64Text(Buffer.from([0xff, 0xfe, 0x00]).toString("base64"))).toBeUndefined();
  });

  it("cho phép lấy lịch sử gói tin qua GET ?action=history", async () => {
    const req = new NextRequest("http://localhost:3000/api/tuong-thuat/ziga-relay?action=history");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.packets)).toBe(true);
  });
});
