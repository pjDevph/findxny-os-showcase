"use client";

import { useState } from "react";

export interface Resource {
  id: string; name: string; type: string; capacity: number | null;
  hourly_rate: number; active: boolean;
  branch_id: string; workspace_id: string;
  branches: { name: string } | null;
  nightly_rate: number | null;
  short_description: string | null;
  description: string | null;
  base_pax: number | null;
  max_pax: number | null;
  extra_pax_fee: number | null;
  security_deposit: number | null;
  cleaning_fee: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
  inclusions: string[];
  photos: string[];
  cover_photo: string | null;
  house_rules: string | null;
  min_nights: number | null;
}

export function roomRate(r: Resource) {
  return r.nightly_rate ?? r.hourly_rate * 24;
}

// Map common amenity names → inline SVG icons. Falls back to a small dot.
export function AmenityIcon({ name }: { name: string }) {
  const lc = name.toLowerCase();
  const s = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (lc.includes("wifi"))                                    return <svg {...s}><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>;
  if (lc.includes("aircon") || lc === "ac" || lc.includes("air condition")) return <svg {...s}><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93 4.93 19.07"/></svg>;
  if (lc.includes("coffee") || lc.includes("espresso") || lc.includes("latte")) return <svg {...s}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/></svg>;
  if (lc.includes("breakfast") || lc.includes("meal"))        return <svg {...s}><path d="M18 2v12"/><path d="M14 2v6c0 1.1.9 2 2 2h2"/><path d="M6 2v20"/><path d="M3 2c0 4 1 6 3 6"/></svg>;
  if (lc.includes("bath") || lc.includes("tub"))              return <svg {...s}><path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-2.121 0a1.5 1.5 0 0 0 0 2.121L9 10.121"/><path d="M2 12h20v4a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="22" x2="6" y2="20"/><line x1="18" y1="22" x2="18" y2="20"/></svg>;
  if (lc.includes("tv") || lc.includes("screen"))             return <svg {...s}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
  if (lc.includes("kitchen"))                                 return <svg {...s}><path d="M6 13.87A4 4 0 0 1 7.41 6a5 5 0 0 1 9.18 0A4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>;
  if (lc.includes("park"))                                    return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>;
  if (lc.includes("pool"))                                    return <svg {...s}><path d="M2 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 16c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/></svg>;
  return <svg {...s}><circle cx="12" cy="12" r="3"/></svg>;
}

// Image that hides itself (revealing .photo-placeholder behind) on load error.
export function RoomImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

export function PhotoPlaceholder() {
  return (
    <div className="photo-placeholder">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="m21 15-5-5L5 21"/>
      </svg>
      <span>Photo coming soon</span>
    </div>
  );
}
