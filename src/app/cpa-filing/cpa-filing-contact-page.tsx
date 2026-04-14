"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

const FORMSPARK_ENDPOINT = "https://submit-form.com/ZUA0xirhV";

type Theme = "light" | "dark";
type SubmitState = "idle" | "success" | "error";

const INITIAL_FORM = {
  name: "",
  email: "",
  phone: "",
};

export function CpaFilingContactPage() {
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
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

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
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        let errorMessage =
          "We could not send your details right now. Please try again in a moment.";

        try {
          const payload = await response.json();
          if (payload?.message && typeof payload.message === "string") {
            errorMessage = payload.message;
          }
        } catch {
          // Ignore non-JSON responses and use the default message.
        }

        throw new Error(errorMessage);
      }

      setFormData(INITIAL_FORM);
      setSubmitState("success");
      setSubmitMessage(
        "Thanks. We received your information and will reach out about CPA filing shortly.",
      );
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(
        error instanceof Error
          ? error.message
          : "We could not send your details right now. Please try again in a moment.",
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
                style={{ height: "80px", width: "auto", display: "block" }}
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
                  CPA Filing
                </span>
                <h1 className="section__title cpa-contact__title">
                  Talk to us about getting your filing over the finish line.
                </h1>
                <p className="section__desc cpa-contact__desc">
                  If you want hands-on filing support from Glide&apos;s team, send
                  your details and we&apos;ll follow up with next steps.
                </p>

                <div className="cpa-contact__highlights">
                  <div className="cpa-contact__highlight">
                    <span className="cpa-contact__highlight-label">
                      Add-on
                    </span>
                    <strong>Add CPA filing to any plan</strong>
                  </div>
                  <div className="cpa-contact__highlight">
                    <span className="cpa-contact__highlight-label">
                      Starting price
                    </span>
                    <strong>$750 per year</strong>
                  </div>
                  <div className="cpa-contact__highlight">
                    <span className="cpa-contact__highlight-label">
                      What to expect
                    </span>
                    <strong>A direct follow-up from our team</strong>
                  </div>
                </div>

                <div className="cpa-contact__details">
                  <div className="cpa-contact__detail-card">
                    <div className="cpa-contact__detail-index">01</div>
                    <h2 className="cpa-contact__detail-title">
                      Share your contact info
                    </h2>
                    <p className="cpa-contact__detail-copy">
                      Just name, email address, and phone number. No long intake
                      form to start.
                    </p>
                  </div>
                  <div className="cpa-contact__detail-card">
                    <div className="cpa-contact__detail-index">02</div>
                    <h2 className="cpa-contact__detail-title">
                      We reach out directly
                    </h2>
                    <p className="cpa-contact__detail-copy">
                      We&apos;ll follow up to walk through fit, timing, and next
                      steps for filing support.
                    </p>
                  </div>
                </div>
              </div>

              <div className="cpa-contact__form-card">
                <div className="cpa-contact__form-head">
                  <span className="cpa-contact__eyebrow">Request information</span>
                  <h2 className="cpa-contact__form-title">Get in touch</h2>
                  <p className="cpa-contact__form-copy">
                    We&apos;ll use this information only to contact you about CPA
                    filing.
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
                      value={formData.name}
                      onChange={(event) =>
                        setFormData((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
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
                      value={formData.email}
                      onChange={(event) =>
                        setFormData((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>

                  <div className="cpa-contact__field">
                    <label className="cpa-contact__label" htmlFor="contact-phone">
                      Phone number
                    </label>
                    <input
                      className="cpa-contact__input"
                      id="contact-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={formData.phone}
                      onChange={(event) =>
                        setFormData((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>

                  <button
                    className="btn btn--primary cpa-contact__submit"
                    type="submit"
                    disabled={isSubmitting}
                    aria-busy={isSubmitting}
                  >
                    {isSubmitting ? "Sending..." : "Request CPA filing info"}
                  </button>

                  {submitState === "idle" ? (
                    <p className="cpa-contact__footnote">
                      We typically follow up within one business day.
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
