// Editable homepage content, stored on workspaces.home_content (jsonb) and
// edited via the admin Home Editor. Featured products stay driven by product flags.

export type HomePromo = {
  title: string;
  blurb?: string;
  image_url?: string;
  cta_label?: string;
  cta_href?: string;
};

export type HomeContent = {
  hero?: { title?: string; lead?: string };
  /** Promos / ads / events band shown on the homepage. */
  promos?: HomePromo[];
};

export const EMPTY_HOME_CONTENT: HomeContent = { hero: { title: "", lead: "" }, promos: [] };

/** Coerce an unknown jsonb value into a safe HomeContent. */
export function parseHomeContent(raw: unknown): HomeContent {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const hero = (o.hero && typeof o.hero === "object" ? o.hero : {}) as Record<string, any>;
  const promos = Array.isArray(o.promos) ? o.promos : [];
  return {
    hero: {
      title: typeof hero.title === "string" ? hero.title : "",
      lead: typeof hero.lead === "string" ? hero.lead : "",
    },
    promos: promos
      .filter((p: any) => p && typeof p === "object")
      .map((p: any) => ({
        title: String(p.title ?? ""),
        blurb: typeof p.blurb === "string" ? p.blurb : "",
        image_url: typeof p.image_url === "string" ? p.image_url : "",
        cta_label: typeof p.cta_label === "string" ? p.cta_label : "",
        cta_href: typeof p.cta_href === "string" ? p.cta_href : "",
      })),
  };
}
