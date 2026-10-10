export const REPORT_REASONS = [
  { id: "cheating", name: "Dùng phần mềm / người khác hỗ trợ" },
  { id: "sandbagging", name: "Cố ý thua, dàn xếp kết quả" },
  { id: "stalling", name: "Cố tình câu giờ, bỏ ván" },
  { id: "name", name: "Tên hiển thị phản cảm" },
  { id: "other", name: "Lý do khác" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

export const reportReasonName = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.name ?? id;
