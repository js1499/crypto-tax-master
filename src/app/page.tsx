import fs from "fs";
import path from "path";
import { LandingPage } from "./landing-page";

export const metadata = {
  title: "Glide | Crypto Tax Software",
  description:
    "Every transaction identified. Effortlessly exact. On-chain verification at the exact block timestamp.",
};

export default async function HomePage() {
  const htmlPath = path.join(process.cwd(), "src", "app", "landing-body.html");
  const bodyHtml = fs.readFileSync(htmlPath, "utf-8");

  return (
    <>
      <link rel="stylesheet" href="/landing/landing.css" />
      <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/cabinet-grotesk" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap" />
      <LandingPage bodyHtml={bodyHtml} />
    </>
  );
}
