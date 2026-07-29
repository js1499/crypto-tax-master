import { renderOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Glide — Crypto & Equities Tax Software";

export default function OpengraphImage() {
  return renderOgImage();
}
