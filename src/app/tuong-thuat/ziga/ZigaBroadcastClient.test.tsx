import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZigaBroadcastClient } from "./ZigaBroadcastClient";

describe("ZigaBroadcastClient", () => {
  it("render trang tường thuật Ziga thành công không lỗi", () => {
    render(<ZigaBroadcastClient />);
    expect(screen.getByText("Đồng bộ trực tiếp Ziga")).toBeDefined();
    expect(screen.getByText("🔍 Soi gói tin WebSocket (Inspector)")).toBeDefined();
    expect(screen.getByText("📜 Script bắt gói tin Ziga")).toBeDefined();
  });
});
