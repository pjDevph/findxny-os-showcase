"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { WORKSPACE_SLUG, peso } from "@/lib/config";
import { type Resource, roomRate, AmenityIcon, RoomImage, PhotoPlaceholder } from "../_shared/roomDisplay";

const PAGE_SIZE = 6;

export default function BookingCartPage() {
  const router = useRouter();
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [resources, setResources]           = useState<Resource[]>([]);
  const [loading, setLoading]               = useState(true);

  // Top "find a stay" intent — passed to /book/[roomId] as query params
  const [intCheckIn, setIntCheckIn]         = useState("");
  const [intCheckOut, setIntCheckOut]       = useState("");
  const [intGuests, setIntGuests]           = useState(2);

  // Carousel state per room (listing previews)
  const [photoIdxes, setPhotoIdxes]         = useState<Record<string, number>>({});

  // Pagination — show first PAGE_SIZE rooms, "Load more" to reveal the rest
  const [visibleCount, setVisibleCount]     = useState(PAGE_SIZE);

  useEffect(() => {
    api.rooms(WORKSPACE_SLUG)
      .then((res) => setResources(res.rooms as unknown as Resource[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function bumpPhoto(id: string, delta: number, len: number, e: React.MouseEvent) {
    e.stopPropagation();
    setPhotoIdxes((prev) => ({ ...prev, [id]: ((prev[id] ?? 0) + delta + len) % len }));
  }

  function selectPhoto(id: string, i: number, e: React.MouseEvent) {
    e.stopPropagation();
    setPhotoIdxes((prev) => ({ ...prev, [id]: i }));
  }

  function bookRoom(roomId: string) {
    const qs = new URLSearchParams();
    if (intCheckIn)  qs.set("in", intCheckIn);
    if (intCheckOut) qs.set("out", intCheckOut);
    if (intGuests)   qs.set("g", String(intGuests));
    const tail = qs.toString();
    const query = tail ? `?${tail}` : "";
    router.push(`/book/${roomId}${query}`);
  }

  const visibleResources = resources.slice(0, visibleCount);
  const hasMore = visibleCount < resources.length;

  return (
    <>
      <section className="container" style={{ paddingBlock: "56px 32px" }}>
        <div className="eyebrow">Bookings · Stays, events &amp; packages</div>
        <h1 className="h-display h1" style={{ margin: "0 0 16px" }}>Book your Mugthemug experience.</h1>
        <p className="lead" style={{ margin: 0 }}>
          Loft staycations, private events, and curated packages — all in one place.
          Pick a loft below to start, or ask us about event &amp; catering packages.
        </p>
      </section>

      <div className="container" style={{ paddingBottom: 80 }}>
        <div style={{ padding: "12px 18px", marginBottom: 16, background: "rgba(var(--tint-rgb), 0.06)", border: "1px solid rgba(var(--tint-rgb), 0.18)", borderRadius: 12, fontSize: 13, color: "var(--text-2)" }}>
          No account needed · Track your booking with your phone number.
        </div>

        {/* ── Top search bar — captures intent dates/guests, passed via URL to the
            room detail page when the user clicks "Book This Room". ── */}
        <form
          className="booking-search-bar"
          onSubmit={(e) => { e.preventDefault(); /* values flow with the navigation */ }}
        >
          <div className="field-tight">
            <label htmlFor="bsb-in">Check-in</label>
            <input id="bsb-in" className="input" type="date" min={todayStr}
              value={intCheckIn} onChange={(e) => setIntCheckIn(e.target.value)} />
          </div>
          <div className="field-tight">
            <label htmlFor="bsb-out">Check-out</label>
            <input id="bsb-out" className="input" type="date" min={intCheckIn || todayStr}
              value={intCheckOut} onChange={(e) => setIntCheckOut(e.target.value)} />
          </div>
          <div className="field-tight">
            <label htmlFor="bsb-g">Guests</label>
            <select id="bsb-g" className="input" value={intGuests} onChange={(e) => setIntGuests(Number(e.target.value))}>
              {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary booking-search-cta" style={{ padding: "12px 20px", fontSize: 13 }}>
            Search rooms
          </button>
        </form>

        <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--amber)", marginBottom: 16 }}>
          Step 1 — Choose your room
        </div>

        {loading && <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--f-mono)" }}>Loading rooms…</div>}

        {/* Empty state — no rooms in the workspace yet */}
        {!loading && resources.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center", border: "1px dashed var(--line-strong)", borderRadius: 16 }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>🏠</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 22, color: "var(--text-1)", marginBottom: 8 }}>
              No rooms available right now
            </div>
            <p style={{ color: "var(--text-3)", fontSize: 14, lineHeight: 1.6, margin: "0 auto 20px", maxWidth: 420 }}>
              We&apos;re still setting up our staycation listings. Check back soon, or reach out about private events &amp; catering packages.
            </p>
            <Link href="/" className="btn btn-ghost">← Back to home</Link>
          </div>
        )}

        {/* Live rooms — horizontal cards, click anywhere on card to go to /book/[id] */}
        {!loading && resources.length > 0 && (
          <>
            <div style={{ display: "grid", gap: 24 }}>
              {visibleResources.map((r) => {
                const photos      = (r.photos?.length ? r.photos : r.cover_photo ? [r.cover_photo] : []);
                const photoIdx    = photoIdxes[r.id] ?? 0;
                const inclusions  = r.inclusions ?? [];
                const capacityNum = r.base_pax ?? r.capacity ?? 2;

                return (
                  <div
                    key={r.id}
                    className="room-card-h"
                    role="button"
                    tabIndex={0}
                    onClick={() => bookRoom(r.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bookRoom(r.id); }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Photo + carousel (placeholder shows when missing/broken) */}
                    <div className="room-photo">
                      <PhotoPlaceholder />
                      {photos.length > 0 && (
                        <RoomImage key={photos[photoIdx]} src={photos[photoIdx]} alt={r.name} />
                      )}
                      {photos.length > 1 && (
                        <>
                          <button type="button" className="photo-nav" style={{ left: 8 }}
                            onClick={(e) => bumpPhoto(r.id, -1, photos.length, e)} aria-label="Previous photo">‹</button>
                          <button type="button" className="photo-nav" style={{ right: 8 }}
                            onClick={(e) => bumpPhoto(r.id, 1, photos.length, e)} aria-label="Next photo">›</button>
                          <div className="photo-dots">
                            {photos.map((_, i) => (
                              <button type="button" key={i} aria-label={`Go to photo ${i + 1}`}
                                className={`photo-dot${i === photoIdx ? " active" : ""}`}
                                onClick={(e) => selectPhoto(r.id, i, e)} />
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Details */}
                    <div className="room-details">
                      <div>
                        <h3 className="room-name">{r.name}</h3>
                        <div className="room-capacity">
                          For {capacityNum} guests
                          {r.min_nights && r.min_nights > 1 ? ` · ${r.min_nights}n min` : ""}
                          {r.check_in_time ? ` · check-in ${r.check_in_time}` : ""}
                        </div>
                      </div>

                      {r.short_description && <p className="room-desc">{r.short_description}</p>}

                      {inclusions.length > 0 && (
                        <div className="amenities">
                          {inclusions.slice(0, 6).map((inc) => (
                            <span key={inc} className="amenity"><AmenityIcon name={inc} /> {inc}</span>
                          ))}
                          {inclusions.length > 6 && <span className="amenity-more">+{inclusions.length - 6} more</span>}
                        </div>
                      )}

                      <div className="room-footer">
                        <div>
                          <div className="price-big">
                            <strong>{peso(roomRate(r))}</strong><small>/ night</small>
                          </div>
                          <div className="price-fineprint">Taxes &amp; extras may apply</div>
                        </div>
                        <div className="room-ctas">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: 12, padding: "8px 14px" }}
                            onClick={(e) => { e.stopPropagation(); bookRoom(r.id); }}
                          >
                            View Details
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ fontSize: 12, padding: "8px 14px", fontWeight: 600 }}
                            onClick={(e) => { e.stopPropagation(); bookRoom(r.id); }}
                          >
                            Book This Room
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div style={{ textAlign: "center", marginTop: 32 }}>
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="btn btn-ghost btn-lg"
                >
                  Load more rooms ({resources.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}

        {/* Quick link back to home in case the user got here by accident */}
        <div style={{ textAlign: "center", marginTop: 48, fontSize: 13, color: "var(--text-3)" }}>
          Looking for something else? <Link href="/" style={{ color: "var(--amber)", textDecoration: "underline" }}>Back to home</Link>
        </div>
      </div>
    </>
  );
}
