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

  it("bóc nước đi từ khung binary Ziga, bỏ move ở gói gửi đi chưa được xác nhận", async () => {
    const send = (direction: string, bytes: number[]) =>
      POST(
        new NextRequest("http://localhost:3000/api/tuong-thuat/ziga-relay", {
          method: "POST",
          body: JSON.stringify({ direction, encoding: "base64", payload: Buffer.from(bytes).toString("base64") }),
        }),
      ).then((r) => r.json());

    const out = await send("out", [0x00, 0x09, 0x1c, 0, 0, 0, 0, 6, 3, 6, 4]);
    expect(out.parsed.move).toBeUndefined();
    const confirmed = await send("in", [0x00, 0x0d, 0x1c, 0, 0, 0, 5, 6, 3, 6, 4, 0, 0, 3, 0x7c]);
    expect(confirmed.parsed.uciMove).toBe("g3g4");
  });

  it("giữ nguyên base64 khi binary không phải UTF-8", () => {
    expect(decodeBase64Text(Buffer.from([0xff, 0xfe, 0x00]).toString("base64"))).toBeUndefined();
  });

  it("nhận lô gói tin theo đúng thứ tự với seq tăng dần", async () => {
    const req = new NextRequest("http://localhost:3000/api/tuong-thuat/ziga-relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packets: [
          { direction: "out", payload: "a" },
          { direction: "in", payload: "b" },
        ],
      }),
    });
    const json = await (await POST(req)).json();
    expect(json).toMatchObject({ ok: true, count: 2 });

    const history = await (
      await GET(new NextRequest("http://localhost:3000/api/tuong-thuat/ziga-relay?action=history"))
    ).json();
    const last = history.packets.slice(-2);
    expect(last.map((p: { payload: string }) => p.payload)).toEqual(["a", "b"]);
    expect(last[1].seq).toBe(last[0].seq + 1);
    expect(history.lastSeq).toBe(last[1].seq);
  });

  it("phát bù các gói đã lỡ khi client nối lại với Last-Event-ID", async () => {
    const post = (payload: string) =>
      POST(
        new NextRequest("http://localhost:3000/api/tuong-thuat/ziga-relay", {
          method: "POST",
          body: JSON.stringify({ direction: "in", payload }),
        }),
      ).then((r) => r.json());
    const first = await post("truoc");
    await post("lo-1");
    await post("lo-2");

    const res = await GET(
      new NextRequest("http://localhost:3000/api/tuong-thuat/ziga-relay", {
        headers: { "Last-Event-ID": String(first.seq) },
      }),
    );
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    const text = new TextDecoder().decode(value);
    expect(text).not.toContain("event: init");
    expect(text).toContain(`id: ${first.seq + 1}`);
    expect(text).toContain(`id: ${first.seq + 2}`);
    expect(text).not.toContain('"truoc"');
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
