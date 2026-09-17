import { NextResponse } from "next/server";
import { deleteTarget, getTargetDetail } from "@/lib/queries";
import { ensureWorker } from "@/lib/worker";

export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = parseId(id);
  if (!targetId) {
    return NextResponse.json({ error: "bad target id" }, { status: 400 });
  }
  ensureWorker();
  const detail = await getTargetDetail(targetId);
  if (!detail) {
    return NextResponse.json({ error: "target not found" }, { status: 404 });
  }
  return NextResponse.json(detail, {
    headers: { "cache-control": "no-store" },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = parseId(id);
  if (!targetId) {
    return NextResponse.json({ error: "bad target id" }, { status: 400 });
  }
  await deleteTarget(targetId);
  return NextResponse.json({ ok: true });
}
