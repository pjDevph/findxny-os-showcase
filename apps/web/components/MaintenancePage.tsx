export function MaintenancePage({
  name,
  message,
  phone,
}: {
  name?: string | null;
  message?: string | null;
  phone?: string | null;
}) {
  return (
    <main style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
      background: "#0a0705",
      color: "#f4ede2",
      textAlign: "center",
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 36 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo2.png"
          alt={name ?? "Mugthemug"}
          style={{ height: 72, width: "auto", opacity: 0.92 }}
        />
      </div>

      {/* Card */}
      <div style={{
        maxWidth: 480,
        width: "100%",
        background: "#120d09",
        border: "1px solid rgba(var(--tint-rgb), 0.12)",
        borderRadius: 20,
        padding: "40px 36px",
        display: "grid",
        gap: 20,
      }}>
        {/* Icon */}
        <div style={{
          width: 56, height: 56,
          borderRadius: "50%",
          background: "rgba(var(--tint-rgb), 0.1)",
          border: "1px solid rgba(var(--tint-rgb), 0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, margin: "0 auto",
        }}>
          🛠️
        </div>

        {/* Heading */}
        <div>
          <div style={{
            fontFamily: "var(--f-mono, monospace)",
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--amber)",
            marginBottom: 10,
          }}>
            Briefly offline
          </div>
          <h1 style={{
            fontSize: "clamp(22px, 5vw, 30px)",
            fontWeight: 700,
            margin: 0,
            letterSpacing: "0.01em",
            color: "#fbf3e6",
          }}>
            {name ? `${name} is` : "We're"} taking a short break
          </h1>
        </div>

        {/* Message */}
        <p style={{
          color: "#9a8f7e",
          fontSize: 15,
          lineHeight: 1.7,
          margin: 0,
        }}>
          {message?.trim()
            ? message
            : "Our online ordering and booking are temporarily unavailable. We'll be back very soon — thank you for your patience!"}
        </p>

        {/* Divider */}
        <div style={{ borderTop: "1px solid rgba(var(--tint-rgb), 0.08)" }} />

        {/* Contact */}
        <div style={{ display: "grid", gap: 10 }}>
          {phone ? (
            <>
              <p style={{ color: "#c9bda9", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                Need to reach us now?
              </p>
              <a
                href={`tel:${phone}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "12px 24px",
                  borderRadius: 10,
                  background: "rgba(var(--tint-rgb), 0.1)",
                  border: "1px solid rgba(var(--tint-rgb), 0.3)",
                  color: "var(--amber)",
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: "none",
                  transition: "background 0.15s",
                }}
              >
                📞 {phone}
              </a>
            </>
          ) : (
            <p style={{ color: "#6b6053", fontSize: 13, margin: 0 }}>
              Visit us in person at Angono, Rizal — open 24/7 at the cafe.
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <p style={{ marginTop: 32, fontSize: 12, color: "#4a3f36", letterSpacing: "0.1em" }}>
        {name ?? "Mugthemug"} · Angono, Rizal · Open 24/7
      </p>
    </main>
  );
}
