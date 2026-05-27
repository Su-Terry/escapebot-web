import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, shares } from "@/lib/db";

// Node.js runtime — required for DB access via postgres-js.
// ImageResponse works in Node.js runtime as well as edge.

// Fetch a Noto Sans TC 700 subset for exactly the characters we'll render.
// IE 11 User-Agent makes Google Fonts return WOFF (not WOFF2); Satori supports WOFF.
async function loadFont(text: string): Promise<ArrayBuffer> {
  const cssUrl =
    `https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700` +
    `&text=${encodeURIComponent(text)}&display=swap`;

  const css = await fetch(cssUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko",
    },
  }).then((r) => r.text());

  const match = css.match(/url\(([^)]+)\)\s*format\('woff'\)/);
  if (!match?.[1]) throw new Error("WOFF font URL not found in Google Fonts response");
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

export async function GET(req: NextRequest) {
  const shareId = req.nextUrl.searchParams.get("id");

  if (!shareId) {
    return new Response("shareId required", { status: 400 });
  }

  const rows = await db
    .select()
    .from(shares)
    .where(eq(shares.shareId, shareId))
    .limit(1);

  const record = rows[0];
  if (!record) {
    return new Response("Share not found", { status: 404 });
  }

  const { scenarioTitle: theme, quote, turnCount } = record;
  const fontData = await loadFont(`${theme}${quote}EscapeBot · ${turnCount} turns`);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#111111",
          padding: "64px 80px",
          fontFamily: '"Noto Sans TC"',
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Theme label */}
        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: "#666666",
            letterSpacing: "0.12em",
          }}
        >
          {theme}
        </div>

        {/* Quote — vertically centered */}
        <div
          style={{
            display: "flex",
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <div
            style={{
              maxWidth: 920,
              color: "#F5F5F5",
              fontSize: 44,
              lineHeight: 1.6,
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            {quote}
          </div>
        </div>

        {/* Signature */}
        <div
          style={{
            display: "flex",
            fontSize: 18,
            color: "#555555",
            letterSpacing: "0.08em",
          }}
        >
          {`EscapeBot · ${turnCount} turns`}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Noto Sans TC",
          data: fontData,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}
