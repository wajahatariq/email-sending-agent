import { NextRequest } from "next/server";
import { getRunLeads } from "@/leadgen/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/export?runId=123 -> CSV with header exactly: email,name,company
// Business name is carried in both `name` and `company`.
export async function GET(req: NextRequest) {
  const runIdRaw = req.nextUrl.searchParams.get("runId");
  const runId = runIdRaw ? parseInt(runIdRaw, 10) : NaN;
  if (Number.isNaN(runId)) {
    return new Response("missing or invalid runId", { status: 400 });
  }

  const leads = await getRunLeads(runId);
  const rows = [["email", "name", "company"]];
  for (const l of leads) {
    rows.push([l._id, l.name, l.company]);
  }
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-run-${runId}.csv"`,
    },
  });
}

// CSV-escape and neutralize leading formula/control chars the importer strips
// (= + - @), so values import cleanly with no edits.
function csvCell(value: string): string {
  let v = (value ?? "").toString();
  v = v.replace(/^[=+\-@]+/, "").trim();
  if (/[",\r\n]/.test(v)) {
    v = `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
