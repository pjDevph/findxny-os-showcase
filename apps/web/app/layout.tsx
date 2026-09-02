import "./globals.css";
import "./pages.css";
import { EnvBanner } from "@/components/EnvBanner";

export const metadata = {
  title: "Mugthemug — 24/7 Cafe · Restaurant · Staycation",
  description:
    "A 24/7 café, restaurant, and staycation lounge in Angono, Rizal. Built for late nights, slow mornings, and everything in between.",
  icons: {
    icon:       "/favicon.ico",
    shortcut:   "/favicon.ico",
    apple:      "/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before paint so the correct theme is on <html> before first render —
// avoids a flash of the wrong theme. Falls back to dark (the site's default) if
// the visitor has never chosen and their OS has no preference either way.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem("theme");
    var theme = saved === "light" || saved === "dark"
      ? saved
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning prevents false hydration warnings from
    // browser extensions (e.g. Grammarly) that inject attributes into
    // <html> and <body> after server render — and from the theme-init
    // script below setting data-theme before React hydrates.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <EnvBanner />
        {children}
      </body>
    </html>
  );
}
