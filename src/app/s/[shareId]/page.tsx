import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getShare } from "@/app/play/actions";
import { ReplayCTA } from "./ReplayCTA";

type Params = Promise<{ shareId: string }>;

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { shareId } = await params;
  const record = await getShare(shareId);
  if (!record) return { title: "EscapeBot" };

  const ogImage = `${baseUrl()}/api/og?id=${encodeURIComponent(shareId)}`;

  return {
    title: `EscapeBot — ${record.scenarioTitle}`,
    description: `${record.quote} · ${record.turnCount} turns`,
    openGraph: {
      title: `EscapeBot — ${record.scenarioTitle}`,
      description: record.quote,
      images: [{ url: ogImage, width: 1200, height: 630, alt: record.quote }],
    },
    twitter: {
      card: "summary_large_image",
      title: `EscapeBot — ${record.scenarioTitle}`,
      description: record.quote,
      images: [ogImage],
    },
  };
}

export default async function SharePage({ params }: { params: Params }) {
  const { shareId } = await params;
  const [record, { userId }] = await Promise.all([getShare(shareId), auth()]);
  if (!record) notFound();

  const ogSrc = `/api/og?id=${encodeURIComponent(shareId)}`;

  return (
    <div
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "40px 24px",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ogSrc}
        alt={record.quote}
        style={{
          width: "100%",
          borderRadius: 12,
          boxShadow: "0 4px 32px rgba(0,0,0,.18)",
          display: "block",
        }}
      />
      {record.scenarioTitle && (
        <p style={{ marginTop: 20, fontSize: 13, color: "#999" }}>
          {record.scenarioTitle} · {record.turnCount} turns
        </p>
      )}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
        <a
          href="/play"
          style={{
            display: "inline-block",
            padding: "12px 28px",
            background: "#111",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          挑戰 EscapeBot →
        </a>
        {record.initialState != null && (
          <ReplayCTA
            shareId={shareId}
            scenarioTitle={record.scenarioTitle}
            isAuthenticated={!!userId}
          />
        )}
      </div>
    </div>
  );
}
