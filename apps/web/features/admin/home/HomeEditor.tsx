"use client";

import { useState, useTransition } from "react";
import type { HomeContent, HomePromo } from "@/lib/home-content";

const EMPTY_PROMO: HomePromo = { title: "", blurb: "", image_url: "", cta_label: "", cta_href: "" };

export function HomeEditor({
  initial,
  saveAction,
}: {
  initial: HomeContent;
  saveAction: (content: HomeContent) => Promise<void>;
}) {
  const [heroTitle, setHeroTitle] = useState(initial.hero?.title ?? "");
  const [heroLead, setHeroLead] = useState(initial.hero?.lead ?? "");
  const [promos, setPromos] = useState<HomePromo[]>(initial.promos ?? []);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function updatePromo(i: number, key: keyof HomePromo, val: string) {
    setPromos((prev) => prev.map((p, idx) => (idx === i ? { ...p, [key]: val } : p)));
    setSaved(false);
  }
  function addPromo() { setPromos((p) => [...p, { ...EMPTY_PROMO }]); setSaved(false); }
  function removePromo(i: number) { setPromos((p) => p.filter((_, idx) => idx !== i)); setSaved(false); }
  function move(i: number, dir: -1 | 1) {
    setPromos((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSaved(false);
  }

  function save() {
    const content: HomeContent = {
      hero: { title: heroTitle.trim(), lead: heroLead.trim() },
      promos: promos
        .filter((p) => p.title.trim())
        .map((p) => ({
          title: p.title.trim(),
          blurb: p.blurb?.trim() || undefined,
          image_url: p.image_url?.trim() || undefined,
          cta_label: p.cta_label?.trim() || undefined,
          cta_href: p.cta_href?.trim() || undefined,
        })),
    };
    startTransition(async () => { await saveAction(content); setSaved(true); });
  }

  const livePromos = promos.filter((p) => p.title.trim());
  const hasIncompletePromo = promos.some((p) => !p.title.trim());

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 24, alignItems: "start" }}>
      {/* ── Editor ── */}
      <div style={{ display: "grid", gap: 20 }}>
        <div className="admin-card">
          <h2>Hero</h2>
          <div style={{ display: "grid", gap: 14 }}>
            <div className="admin-field">
              <label htmlFor="home-hero-title">Hero title (one phrase per line)</label>
              <textarea id="home-hero-title" className="input" rows={4} value={heroTitle}
                onChange={(e) => { setHeroTitle(e.target.value); setSaved(false); }}
                placeholder={"COFFEE.\nFOCUS.\nRECHARGE.\nREPEAT."} />
            </div>
            <div className="admin-field">
              <label htmlFor="home-hero-lead">Hero subtitle</label>
              <textarea id="home-hero-lead" className="input" rows={2} value={heroLead}
                onChange={(e) => { setHeroLead(e.target.value); setSaved(false); }}
                placeholder="A 24/7 café, restaurant, and staycation lounge…" />
            </div>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
              Leave blank to keep the built-in default hero copy.
            </p>
          </div>
        </div>

        <div className="admin-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Promos / Events</h2>
            <button type="button" className="btn-xs" onClick={addPromo}>+ Add card</button>
          </div>
          <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
            {promos.length === 0 && (
              <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>
                No promos yet. Add a card to feature an ad, promo, or upcoming event on the homepage.
              </p>
            )}
            {promos.map((p, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn-xs" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button type="button" className="btn-xs" onClick={() => move(i, 1)} disabled={i === promos.length - 1}>↓</button>
                  <button type="button" className="btn-xs" style={{ color: "var(--err)" }} onClick={() => removePromo(i)}>Remove</button>
                </div>
                <div className="admin-field">
                  <label htmlFor={`promo-title-${i}`}>Title</label>
                  <input id={`promo-title-${i}`} className="input" value={p.title} onChange={(e) => updatePromo(i, "title", e.target.value)} placeholder="e.g. Acoustic Night — Fri 8pm" />
                </div>
                <div className="admin-field">
                  <label htmlFor={`promo-blurb-${i}`}>Blurb</label>
                  <input id={`promo-blurb-${i}`} className="input" value={p.blurb ?? ""} onChange={(e) => updatePromo(i, "blurb", e.target.value)} placeholder="Short description" />
                </div>
                <div className="admin-field">
                  <label htmlFor={`promo-image-${i}`}>Image URL (optional)</label>
                  <input id={`promo-image-${i}`} className="input" value={p.image_url ?? ""} onChange={(e) => updatePromo(i, "image_url", e.target.value)} placeholder="https://…" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="admin-field">
                    <label htmlFor={`promo-cta-label-${i}`}>Button label (optional)</label>
                    <input id={`promo-cta-label-${i}`} className="input" value={p.cta_label ?? ""} onChange={(e) => updatePromo(i, "cta_label", e.target.value)} placeholder="Reserve" />
                  </div>
                  <div className="admin-field">
                    <label htmlFor={`promo-cta-href-${i}`}>Button link (optional)</label>
                    <input id={`promo-cta-href-${i}`} className="input" value={p.cta_href ?? ""} onChange={(e) => updatePromo(i, "cta_href", e.target.value)} placeholder="/booking" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn btn-primary" onClick={save} disabled={pending || hasIncompletePromo} style={{ fontSize: 13, padding: "10px 24px" }}>
            {pending ? "Saving…" : "Save homepage"}
          </button>
          {saved && <span style={{ color: "var(--ok, #5fcf80)", fontSize: 13 }}>Saved ✓</span>}
          {!pending && hasIncompletePromo && (
            <span style={{ color: "var(--err, #ff6b6b)", fontSize: 12 }}>
              Give every promo card a title (or remove it) before saving.
            </span>
          )}
        </div>
      </div>

      {/* ── Live preview ── */}
      <div className="admin-card" style={{ position: "sticky", top: 16 }}>
        <h2>Preview</h2>
        <div style={{ background: "var(--bg-0, #0e0a06)", borderRadius: 12, padding: 20, marginTop: 12 }}>
          {/* Hero */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontFamily: "var(--f-display)", fontSize: 30, lineHeight: 1.05, margin: "0 0 10px", color: "var(--text-0)", textTransform: "uppercase" }}>
              {(heroTitle.trim() || "COFFEE.\nFOCUS.\nRECHARGE.\nREPEAT.").split("\n").map((line, idx) => (
                <span key={idx} style={{ display: "block" }}>{line}</span>
              ))}
            </h1>
            <p style={{ color: "var(--text-3)", fontSize: 14, margin: 0 }}>
              {heroLead.trim() || "A 24/7 café, restaurant, and staycation lounge — built for late nights and slow mornings."}
            </p>
          </div>

          {/* Promos */}
          {livePromos.length > 0 && (
            <>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--amber-bright)", marginBottom: 10 }}>
                What&apos;s On
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {livePromos.map((p, i) => (
                  <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "var(--bg-1)" }}>
                    {p.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt={p.title} style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                    )}
                    <div style={{ padding: 12 }}>
                      <div style={{ fontWeight: 700, color: "var(--text-0)", fontSize: 15 }}>{p.title}</div>
                      {p.blurb && <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>{p.blurb}</div>}
                      {p.cta_label && (
                        <span className="btn-xs primary" style={{ display: "inline-block", marginTop: 10 }}>{p.cta_label}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 10 }}>
          Approximate preview. Featured products are managed from the Products page.
        </p>
      </div>
    </div>
  );
}
