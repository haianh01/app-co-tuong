import { PGlite } from "@electric-sql/pglite";
const dir = process.argv[2];
try {
  const db = new PGlite(dir);
  console.log((await db.query("select count(*) from pg_namespace")).rows);
  await db.close();
  console.log("OPEN OK");
} catch (e) { console.log("FAIL", (e as Error).message); }
