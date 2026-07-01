import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { LeadIntakeForm } from "@/components/lead/lead-intake-form";
import { TENANT_HEADER } from "@/lib/tenant-host";

function internalApiOrigin(): string {
  return process.env.INTERNAL_API_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:4000";
}

async function fetchCaterer(slug: string) {
  const res = await fetch(`${internalApiOrigin()}/api/caterers/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 }
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { caterer?: { name: string; slug: string } };
  return data.caterer ?? null;
}

export default async function TenantBookPage() {
  const slug = headers().get(TENANT_HEADER)?.trim().toLowerCase();
  if (!slug) notFound();

  const caterer = await fetchCaterer(slug);
  if (!caterer) notFound();

  return <LeadIntakeForm catererSlug={caterer.slug} catererName={caterer.name} />;
}
