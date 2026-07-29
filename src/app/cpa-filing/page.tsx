import { CpaFilingContactPage } from "./cpa-filing-contact-page";

export const metadata = {
  title: "CPA Filing",
  description:
    "Have a licensed CPA review and file your crypto & equities taxes. Share your name, email, and phone number and the Glide team will walk you through CPA filing.",
  alternates: { canonical: "/cpa-filing" },
};

export default function Page() {
  return (
    <>
      <link rel="stylesheet" href="/landing/landing.css" />
      <link
        rel="stylesheet"
        href="https://fonts.cdnfonts.com/css/cabinet-grotesk"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap"
      />
      <CpaFilingContactPage />
    </>
  );
}
