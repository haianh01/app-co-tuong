// Chạy trước mỗi file test giao diện (happy-dom).

import { cleanup } from "@testing-library/react";
import { createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { afterEach, beforeEach, vi } from "vitest";

// next/link cần router của App Router; trong test chỉ cần một thẻ <a> bình thường.
type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; children?: ReactNode };

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: LinkProps) => {
    delete rest.prefetch;
    return createElement("a", { href, ...rest }, children);
  },
}));

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(null, { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
