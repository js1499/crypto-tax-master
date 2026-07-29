import { renderOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Glide — Crypto & Equities Tax Software";

// Presence of this file makes Next emit twitter:image + twitter:card=summary_large_image.
export default function TwitterImage() {
  return renderOgImage();
}
