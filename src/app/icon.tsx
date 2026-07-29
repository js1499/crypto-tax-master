import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Favicon — a simple brand "G" mark on the Glide emerald, generated via next/og.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#10b981",
          color: "#04110c",
          fontSize: 24,
          fontWeight: 800,
          borderRadius: 6,
        }}
      >
        G
      </div>
    ),
    { ...size },
  );
}
