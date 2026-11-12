import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { LeadIntakeFormEmbed } from "@/components/lead/lead-intake-form-embed";
import { isPublicBookSlug } from "@/lib/tenant-host";

function internalApiOrigin(): string {
  return process.env.INTERNAL_API_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:4000";
}

/** Get the public-facing origin for API calls from the embed */
function getPublicOrigin(): string {
  const headersList = headers();
  const host = headersList.get("host") ?? headersList.get("x-forwarded-host");
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  // Fallback to env
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
    : "";
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

type PageProps = {
  params: { slug: string };
  searchParams: { accent?: string };
};

export default async function EmbedPage({ params, searchParams }: PageProps) {
  const slug = params.slug?.trim().toLowerCase();
  if (!slug || !isPublicBookSlug(slug)) notFound();

  const caterer = await fetchCaterer(slug);
  if (!caterer) notFound();

  const accentColor = searchParams.accent?.startsWith("#")
    ? searchParams.accent
    : searchParams.accent
      ? `#${searchParams.accent}`
      : "#1B2A4A";

  const apiBaseUrl = getPublicOrigin();

  return (
    <LeadIntakeFormEmbed
      catererSlug={caterer.slug}
      catererName={caterer.name}
      apiBaseUrl={apiBaseUrl}
      accentColor={accentColor}
    />
  );
}

export const metadata = {
  title: "Request a Quote",
  robots: { index: false, follow: false }
};
