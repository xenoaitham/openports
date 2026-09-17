import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TargetLive from "@/components/target-live";
import { getTargetDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await getTargetDetail(Number(id));
  if (!detail) return { title: "Target not found" };
  return {
    title: detail.target.domain,
    description: `Scan results and findings for ${detail.target.domain}.`,
  };
}

export default async function TargetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId) || targetId <= 0) notFound();
  const detail = await getTargetDetail(targetId);
  if (!detail) notFound();
  return <TargetLive initial={detail} />;
}
