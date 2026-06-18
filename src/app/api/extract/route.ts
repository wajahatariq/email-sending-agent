import { NextRequest } from "next/server";
import { ExtractRequestSchema } from "@/leadgen/types";
import { getCountry } from "@/leadgen/countries";
import { planQueries } from "@/leadgen/planner";
import { runSearches } from "@/leadgen/search";
import { extractCandidates } from "@/leadgen/extractor";
import { cleanCandidate } from "@/leadgen/cleaner";
import { createRun, storeLead, finalizeRun } from "@/leadgen/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long crawls are meant to run via `next start` (persistent process), NOT
// serverless. On Vercel this endpoint is capped to the plan limit; use the
// persistent deployment or local runs for full-length extraction.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = ExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { country: countryKey, nichePrompt } = parsed.data;
  const country = getCountry(countryKey);

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      let total = 0;
      let runId = 0;
      try {
        runId = await createRun(countryKey, nichePrompt);

        send("status", { stage: "planning queries", found: 0 });
        const queries = await planQueries(nichePrompt, country);
        send("status", { stage: `searching (${queries.length} queries)`, found: 0 });

        const hits = await runSearches(queries, country);
        send("status", { stage: `crawling ${hits.length} sites`, found: 0 });

        const seenThisRun = new Set<string>();
        for await (const cand of extractCandidates(hits)) {
          if (closed) break;
          if (seenThisRun.has(cand.email.toLowerCase())) continue;
          seenThisRun.add(cand.email.toLowerCase());

          const { lead } = await cleanCandidate(cand, country.regionCode);
          if (!lead) continue;

          const stored = await storeLead(runId, lead);
          if (!stored) continue; // lost a race / already stored

          total++;
          send("lead", {
            name: lead.name,
            company: lead.company,
            email: lead.email,
            emailType: lead.emailType,
            sourceUrl: lead.sourceUrl,
          });
          if (total % 5 === 0) {
            send("status", { stage: "extracting", found: total });
          }
        }

        await finalizeRun(runId, total);
        send("done", { total, runId });
      } catch (err) {
        send("status", { stage: "error: " + (err as Error).message, found: total });
        send("done", { total, runId });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
