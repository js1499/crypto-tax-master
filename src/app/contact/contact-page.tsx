"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

const FORMSPARK_ENDPOINT = "https://submit-form.com/ZUA0xirhV";

type Theme = "light" | "dark";
type SubmitState = "idle" | "success" | "error";

const INITIAL_FORM = {
  name: "",
  email: "",
  subject: "",
  message: "",
};

export function ContactPage() {
  const [theme, setTheme] = useState<Theme>("light");
  const [isScrolled, setIsScrolled] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const savedTheme =
      typeof window !== "undefined" ? window.localStorage.getItem("theme") : null;
    const nextTheme: Theme = savedTheme === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    return () => {
      document.documentElement.removeAttribute("data-theme");
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitState("idle");
    setSubmitMessage("");

    try {
      const response = await fetch(FORMSPARK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ ...formData, _source: "contact_page" }),
      });

      if (!response.ok) {
        let errorMessage =
          "We could not send your message right now. Please try again in a moment.";
        try {
          const payload = await response.json();
          if (payload?.message && typeof payload.message === "string") {
            errorMessage = payload.message;
          }
        } catch {
          /* ignore */
        }
        throw new Error(errorMessage);
      }

      setFormData(INITIAL_FORM);
      setSubmitState("success");
      setSubmitMessage(
        "Thanks for reaching out! We'll get back to you as soon as possible.",
      );
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(
        error instanceof Error
          ? error.message
          : "We could not send your message right now. Please try again in a moment.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <nav className={`nav ${isScrolled ? "scrolled" : ""}`} id="nav">
        <div className="container">
          <div className="nav__inner">
            <Link href="/" className="nav__logo" aria-label="Go to Glide home">
              <img
                src="/landing/logos/glide-logo.png"
                alt="Glide"
                style={{ height: "120px", width: "auto", display: "block" }}
              />
            </Link>

            <div className="nav__links">
              <Link href="/#how" className="nav__link">
                How it works
              </Link>
              <Link href="/#pricing" className="nav__link">
                Pricing
              </Link>
            </div>

            <div
              className="nav__cta"
              style={{ display: "flex", alignItems: "center", gap: "12px" }}
            >
              <Link
                href="/login"
                className="nav__link"
                style={{ whiteSpace: "nowrap" }}
              >
                Sign in
              </Link>
              <Link href="/#pricing" className="btn btn--primary">
                Get started
              </Link>
              <button
                className="theme-toggle"
                id="theme-toggle"
                aria-label="Toggle theme"
                type="button"
                onClick={() =>
                  setTheme((current) => (current === "light" ? "dark" : "light"))
                }
              >
                <svg
                  className="theme-toggle__sun"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
                <svg
                  className="theme-toggle__moon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main>
        <section className="hero section--textured cpa-contact-hero" id="hero">
          <div className="hero__grid" aria-hidden="true"></div>
          <div className="hero__glow" aria-hidden="true"></div>

          <div className="container">
            <div className="cpa-contact">
              <div className="cpa-contact__content">
                <span className="section__label section__label--accent">
                  Contact
                </span>
                <h1 className="section__title cpa-contact__title" style={{ maxWidth: "16ch" }}>
                  We&apos;d love to hear from you.
                </h1>
                <p className="section__desc cpa-contact__desc">
                  Have a question, need help, or want to share feedback?
                  Reach out and our team will get back to you.
                </p>

                <div className="cpa-contact__highlights">
                  <div className="cpa-contact__highlight" style={{ overflow: "hidden" }}>
                    <span className="cpa-contact__highlight-label">Email</span>
                    <strong style={{ fontSize: "1rem", wordBreak: "break-all" }}>
                      <a href="mailto:contact@glidetaxes.com" style={{ color: "inherit", textDecoration: "none" }}>
                        contact@glidetaxes.com
                      </a>
                    </strong>
                  </div>
                  <div className="cpa-contact__highlight">
                    <span className="cpa-contact__highlight-label">Response time</span>
                    <strong>Within 1 business day</strong>
                  </div>
                  <div className="cpa-contact__highlight">
                    <span className="cpa-contact__highlight-label">Support</span>
                    <strong>Available for all plans</strong>
                  </div>
                </div>

                <div className="cpa-contact__details">
                  <div className="cpa-contact__detail-card">
                    <div className="cpa-contact__detail-index">01</div>
                    <h2 className="cpa-contact__detail-title">
                      General inquiries
                    </h2>
                    <p className="cpa-contact__detail-copy">
                      Questions about plans, features, or how Glide works?
                      Fill out the form and we&apos;ll point you in the right direction.
                    </p>
                  </div>
                  <div className="cpa-contact__detail-card">
                    <div className="cpa-contact__detail-index">02</div>
                    <h2 className="cpa-contact__detail-title">
                      Technical support
                    </h2>
                    <p className="cpa-contact__detail-copy">
                      Running into an issue with your account, transactions, or
                      reports? Describe what&apos;s happening and we&apos;ll help resolve it.
                    </p>
                  </div>
                </div>
              </div>

              <div className="cpa-contact__form-card">
                <div className="cpa-contact__form-head">
                  <span className="cpa-contact__eyebrow">Get in touch</span>
                  <h2 className="cpa-contact__form-title">Send us a message</h2>
                  <p className="cpa-contact__form-copy">
                    We&apos;ll respond to your message as quickly as we can.
                  </p>
                </div>

                <form
                  className="cpa-contact__form"
                  action={FORMSPARK_ENDPOINT}
                  method="POST"
                  onSubmit={handleSubmit}
                >
                  <div className="cpa-contact__field">
                    <label className="cpa-contact__label" htmlFor="contact-name">
                      Name
                    </label>
                    <input
                      className="cpa-contact__input"
                      id="contact-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Your full name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((c) => ({ ...c, name: e.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className="cpa-contact__field">
                    <label className="cpa-contact__label" htmlFor="contact-email">
                      Email address
                    </label>
                    <input
                      className="cpa-contact__input"
                      id="contact-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData((c) => ({ ...c, email: e.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className="cpa-contact__field">
                    <label className="cpa-contact__label" htmlFor="contact-subject">
                      Subject
                    </label>
                    <input
                      className="cpa-contact__input"
                      id="contact-subject"
                      name="subject"
                      type="text"
                      placeholder="What is this about?"
                      value={formData.subject}
                      onChange={(e) =>
                        setFormData((c) => ({ ...c, subject: e.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className="cpa-contact__field">
                    <label className="cpa-contact__label" htmlFor="contact-message">
                      Message
                    </label>
                    <textarea
                      className="cpa-contact__input"
                      id="contact-message"
                      name="message"
                      rows={5}
                      placeholder="Tell us how we can help..."
                      value={formData.message}
                      onChange={(e) =>
                        setFormData((c) => ({ ...c, message: e.target.value }))
                      }
                      required
                      style={{ resize: "vertical", minHeight: "120px" }}
                    />
                  </div>

                  <button
                    className="btn btn--primary cpa-contact__submit"
                    type="submit"
                    disabled={isSubmitting}
                    aria-busy={isSubmitting}
                  >
                    {isSubmitting ? "Sending..." : "Send message"}
                  </button>

                  {submitState === "idle" ? (
                    <p className="cpa-contact__footnote">
                      Or email us directly at{" "}
                      <a
                        href="mailto:contact@glidetaxes.com"
                        style={{ color: "var(--accent)", textDecoration: "none" }}
                      >
                        contact@glidetaxes.com
                      </a>
                    </p>
                  ) : (
                    <p
                      className={`cpa-contact__status cpa-contact__status--${submitState}`}
                      role="status"
                      aria-live="polite"
                    >
                      {submitMessage}
                    </p>
                  )}
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
