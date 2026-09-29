import { ImageResponse } from "next/og";

export const alt = "Glide - every transaction identified, effortlessly";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(145deg, #f0f2ee 0%, #d8f5e9 52%, #dcecff 100%)",
          color: "#1a2318",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          padding: "72px",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "flex-start",
            background: "rgba(255,255,255,0.86)",
            border: "1px solid rgba(4,47,36,0.12)",
            borderRadius: "36px",
            boxShadow: "0 30px 80px rgba(4,47,36,0.12)",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            justifyContent: "space-between",
            padding: "54px 60px",
            width: "100%",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", fontSize: 42, fontWeight: 700, gap: 16 }}>
            <span style={{ color: "#2e90fa" }}>G</span>
            <span>lide</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ color: "#047857", fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
              Crypto tax software
            </div>
            <div style={{ fontFamily: "Georgia", fontSize: 68, lineHeight: 1.02, maxWidth: 880 }}>
              Every transaction identified, effortlessly.
            </div>
          </div>
          <div style={{ color: "#3d4a38", display: "flex", fontSize: 24, gap: 22 }}>
            <span>Major blockchains</span><span>|</span><span>Exchanges</span><span>|</span><span>Wallets</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
