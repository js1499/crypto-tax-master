"use client";

import { useEffect, useState } from "react";

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  );
}

/**
 * Auto table of contents built from the rendered article's <h2>s. Injects ids where missing,
 * highlights the current section via IntersectionObserver, and smooth-scrolls on click. Renders
 * nothing if there are fewer than two headings. Category color is inherited via the --cat CSS var.
 */
export function TableOfContents() {
  const [items, setItems] = useState<{ id: string; text: string }[]>([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    const heads = Array.from(document.querySelectorAll<HTMLElement>(".blog-body h2"));
    const used = new Set<string>();
    const list = heads.map((h) => {
      let id = h.id;
      if (!id) {
        const base = slugify(h.textContent || "");
        id = base;
        let n = 2;
        while (used.has(id)) id = `${base}-${n++}`;
        h.id = id;
      }
      used.add(id);
      return { id, text: h.textContent || "" };
    });
    setItems(list);
    if (heads.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive((vis[0].target as HTMLElement).id);
      },
      { rootMargin: "-84px 0px -66% 0px", threshold: 0 },
    );
    heads.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, []);

  if (items.length < 2) return null;

  const onClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
      setActive(id);
    }
  };

  return (
    <nav className="blog-toc" aria-label="On this page">
      <div className="blog-toc__title">On this page</div>
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              onClick={(e) => onClick(e, it.id)}
              className={active === it.id ? "is-active" : ""}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
