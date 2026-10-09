import type { Metadata } from "next";
import { PuzzleClient } from "./PuzzleClient";

export const metadata: Metadata = {
  title: "Cờ thế – Tàn cuộc",
};

export default function PuzzlePage() {
  return <PuzzleClient />;
}
