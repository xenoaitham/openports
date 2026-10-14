import { NextResponse } from "next/server";
import { createTarget, listTargetOverviews } from "@/lib/queries";
import { ensureWorker } from "@/lib/worker";
import { isPublicDemo, DEMO_READ_ONLY_MESSAGE } from "@/lib/demo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (isPublicDemo()) {
    return NextResponse.json({ error: DEMO_READ_ONLY_MESSAGE }, { status: 403 });
  }
  let body: { domain?: unknown };
  try {
    body = (await request.json()) as { domain?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const domain = typeof body.domain === "string" ? body.domain : "";
  if (!domain.trim()) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }
  const result = await createTarget(domain);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}

export async function GET() {
  ensureWorker();
  const overviews = await listTargetOverviews();
  return NextResponse.json(overviews, {
    headers: { "cache-control": "no-store" },
  });
}
