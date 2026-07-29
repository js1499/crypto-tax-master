import { ContactPage } from "./contact-page";

export const metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the Glide team about crypto & equities tax software, CPA filing, or support. We usually reply within one business day.",
  alternates: { canonical: "/contact" },
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
      <ContactPage />
    </>
  );
}
