import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import fs from "fs";
import path from "path";
import { LandingPage } from "./landing-page";

export const metadata = {
  title: "Glide | Crypto Tax Software",
  description:
    "Every transaction identified. Effortlessly exact. On-chain verification at the exact block timestamp.",
};

export default async function HomePage() {
  const session = await getServerSession();
  if (session?.user) {
    redirect("/accounts");
  }

  const htmlPath = path.join(process.cwd(), "src", "app", "landing-body.html");
  const bodyHtml = fs.readFileSync(htmlPath, "utf-8");

  return <LandingPage bodyHtml={bodyHtml} />;
}
