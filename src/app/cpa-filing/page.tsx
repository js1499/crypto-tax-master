import { CpaFilingContactPage } from "./cpa-filing-contact-page";

export const metadata = {
  title: "Glide | CPA Filing",
  description:
    "Get in touch with Glide about CPA filing. Share your name, email, and phone number to learn more.",
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
