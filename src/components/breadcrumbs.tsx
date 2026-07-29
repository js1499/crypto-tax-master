import Link from "next/link";

export interface Crumb {
  name: string;
  href: string;
}

const SITE_URL = "https://glidetaxes.com";

/** Visible breadcrumb trail + BreadcrumbList JSON-LD (rich-result eligible) for nested blog pages. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.href}`,
    })),
  };
  return (
    <nav aria-label="Breadcrumb" className="blog-breadcrumbs">
      <ol>
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={it.href}>
              {last ? (
                <span aria-current="page">{it.name}</span>
              ) : (
                <>
                  <Link href={it.href}>{it.name}</Link>
                  <span aria-hidden="true"> / </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </nav>
  );
}
