import { NextRequest } from "next/server";
import { z } from "zod";
import { pushRecipients } from "@/leadgen/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PushSchema = z.object({
  runId: z.number().int().nonnegative(),
  campaignId: z.number().int().positive(),
});

// POST /api/push { runId, campaignId } -> insert pending recipients into the
// sender's `recipients` collection (suppression applied). Returns counts.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = PushSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { inserted, skipped } = await pushRecipients(
      parsed.data.runId,
      parsed.data.campaignId
    );
    return Response.json({ inserted, skipped });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
