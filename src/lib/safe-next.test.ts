import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("giữ đường dẫn nội bộ kèm query và hash", () => {
    expect(safeNext("/online?tc=10%2B0#x")).toBe("/online?tc=10%2B0#x");
    expect(safeNext("/u/anh")).toBe("/u/anh");
  });

  it("chặn chuyển hướng ra ngoài", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "evil.com", "", null, 42]) {
      expect(safeNext(bad)).toBe("/online");
    }
  });
});
