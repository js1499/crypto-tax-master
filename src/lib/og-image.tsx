import { ImageResponse } from "next/og";

// Shared 1200x630 social card, generated at request time via next/og (Satori) so we don't need a
// hand-designed asset. Used by both src/app/opengraph-image.tsx and src/app/twitter-image.tsx.
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0b0f0e",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 800,
              color: "#04110c",
            }}
          >
            G
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em" }}>Glide</div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 66,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            maxWidth: 940,
          }}
        >
          Crypto &amp; equities tax software that gets every number right.
        </div>
        <div style={{ display: "flex", marginTop: "32px", fontSize: 29, color: "#9fb3ac" }}>
          Every transaction identified · priced to the exact block · audit-ready forms
        </div>
        <div style={{ display: "flex", marginTop: "40px", fontSize: 26, color: "#10b981", fontWeight: 600 }}>
          glidetaxes.com
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
