"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "admin-sidebar-collapsed";
const HTML_CLASS  = "admin-sidebar-collapsed";

export function SidebarCollapseToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(document.documentElement.classList.contains(HTML_CLASS));
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.classList.toggle(HTML_CLASS, next);
    try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
  }

  return (
    <button
      type="button"
      className="admin-collapse-btn"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {collapsed
          ? <polyline points="9 18 15 12 9 6" />
          : <polyline points="15 18 9 12 15 6" />}
      </svg>
    </button>
  );
}
