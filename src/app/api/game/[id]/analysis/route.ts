import { connection } from "next/server";
import { getAnalysisQuota, getSavedAnalysis } from "@/server/analysis/store";
import { SESSION_COOKIE, getUserBySession, parseCookies } from "@/server/auth";
import { getDb } from "@/server/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  if (!/^[A-Za-z0-9]{6,12}$/.test(id)) {
    return Response.json({ error: "Mã ván không hợp lệ" }, { status: 400 });
  }

  const db = await getDb();
  const saved = await getSavedAnalysis(db, id);

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "127.0.0.1";
  const token = parseCookies(request.headers.get("cookie") ?? undefined)[SESSION_COOKIE];
  const user = token ? await getUserBySession(db, token) : null;
  const quota = await getAnalysisQuota(db, user, ip);

  if (saved) {
    return Response.json({
      analyzed: true,
      evals: saved,
      quota,
    });
  }

  return Response.json({
    analyzed: false,
    evals: null,
    quota,
  });
}
