import { ContactPage } from "./contact-page";

export const metadata = {
  title: "Glide | Contact Us",
  description:
    "Get in touch with the Glide team. We'd love to hear from you.",
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
