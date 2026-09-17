import { NextResponse } from "next/server";
import { verifyTarget } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "bad target id" }, { status: 400 });
  }
  const result = await verifyTarget(targetId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 200 },
    );
  }
  return NextResponse.json({ ok: true, status: result.status });
}
