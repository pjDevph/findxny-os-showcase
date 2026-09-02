"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

function isValidOrderRef(v: string) {
  return /^ORD-\d{6}$/.test(v.trim().toUpperCase());
}

function isValidBookingRef(v: string) {
  // 8+ alphanumeric chars (hyphens stripped by backend). Min 6 to gate obvious garbage.
  const hex = v.trim().replace(/[^0-9A-Fa-f]/g, "");
  return hex.length >= 6 && hex.length <= 8;
}

function isValidPHPhone(digits: string) {
  return /^9\d{9}$/.test(digits);
}

const LBL: React.CSSProperties = {
  fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.16em",
  textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8,
  display: "block",
};

export default function CheckBookingPage() {
  const router = useRouter();
  const [type,     setType]     = useState<"order" | "booking">("order");
  const [ref,      setRef]      = useState("");
  const [phone,    setPhone]    = useState(""); // 10 digits, +63 shown as fixed prefix
  const [refErr,   setRefErr]   = useState("");
  const [phoneErr, setPhoneErr] = useState("");
  const [topErr,   setTopErr]   = useState<string | null>(null);

  const isRefValid   = type === "order" ? isValidOrderRef(ref) : isValidBookingRef(ref);
  const isPhoneValid = isValidPHPhone(phone);
  const isFormReady  = isRefValid && isPhoneValid;

  // Auto-clear errors once form is valid
  useEffect(() => {
    if (isFormReady) { setRefErr(""); setPhoneErr(""); setTopErr(null); }
  }, [isFormReady]);

  function handleTypeChange(t: "order" | "booking") {
    setType(t);
    setRef(""); setPhone("");
    setRefErr(""); setPhoneErr(""); setTopErr(null);
  }

  function handleRefChange(raw: string) {
    const up = raw.toUpperCase();
    setRef(up);
    if (refErr) setRefErr("");
    if (topErr) setTopErr(null);
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    let hasErr = false;

    const normRef = ref.trim().toUpperCase();
    if (!normRef) {
      setRefErr(type === "order" ? "Please enter your order number." : "Please enter your booking reference.");
      hasErr = true;
    } else if (!isRefValid) {
      setRefErr(type === "order"
        ? "Please enter a valid order number. Example: ORD-000001"
        : "Please enter a valid booking reference. Example: 8F3A21C9");
      hasErr = true;
    }

    if (!phone) {
      setPhoneErr("Please enter a valid Philippine mobile number.");
      hasErr = true;
    } else if (!isPhoneValid) {
      setPhoneErr("Enter 10 digits starting with 9. Example: 9171234567");
      hasErr = true;
    }

    if (hasErr) {
      setTopErr("Please fix the highlighted fields before continuing.");
      return;
    }

    const fullPhone = `+63${phone}`;
    if (type === "booking") {
      sessionStorage.setItem("mtm.lastBooking", JSON.stringify({ phone: fullPhone }));
      router.push(`/booking-tracking/${encodeURIComponent(normRef)}`);
    } else {
      sessionStorage.setItem("mtm.lastOrder", JSON.stringify({ name: "", phone: fullPhone, method: "" }));
      router.push(`/order-tracking/${encodeURIComponent(normRef)}`);
    }
  }

  const refPlaceholder   = type === "order" ? "ORD-000001" : "8F3A21C9";
  const refHelperText    = type === "order" ? "Example: ORD-000001" : "Found on your booking confirmation";
  const phoneHelperText  = type === "order" ? "Enter 10 digits · e.g. 9171234567" : "Use the mobile number used during booking";

  return (
    <div className="ck-wrap">
      <div className="container">
        <div className="ck-form-wrap">
          <div className="eyebrow" style={{ textAlign: "center" }}>Order &amp; Booking Tracker</div>
          <h1 className="h-display h2" style={{ textAlign: "center", margin: "0 0 32px" }}>Track your order or stay.</h1>
          <form className="ck-form" onSubmit={go}>
            <h2>Find your {type === "order" ? "order" : "stay"}</h2>
            <p className="sub">
              {type === "order"
                ? "Enter your order number and mobile number to verify ownership."
                : "Use the same mobile number you provided during booking."}
            </p>

            <div className="stack">
              {/* Tab toggle */}
              <div style={{ display: "flex", gap: 8 }}>
                {(["order", "booking"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`btn ${type === t ? "btn-primary" : "btn-ghost"}`}
                    style={{ flex: 1, fontSize: 13 }}
                    onClick={() => handleTypeChange(t)}
                  >
                    {t === "order" ? "Food order" : "Room booking"}
                  </button>
                ))}
              </div>

              {/* Reference number */}
              <div className="field">
                <label style={LBL} htmlFor="ck-ref">
                  {type === "order" ? "Order number" : "Booking reference"} *
                </label>
                <input
                  id="ck-ref"
                  className="input"
                  value={ref}
                  onChange={(e) => handleRefChange(e.target.value)}
                  placeholder={refPlaceholder}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  style={refErr ? { borderColor: "var(--err)" } : undefined}
                />
                {refErr
                  ? <div style={{ color: "var(--err)", fontSize: 12, marginTop: 4 }}>{refErr}</div>
                  : <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 3 }}>{refHelperText}</div>}
              </div>

              {/* Mobile — fixed +63 prefix + digits only */}
              <div className="field">
                <label style={LBL} htmlFor="ck-phone">Mobile number *</label>
                <div style={{ display: "flex", alignItems: "stretch", borderRadius: 10, overflow: "hidden", border: `1px solid ${phoneErr ? "var(--err)" : "var(--line-strong)"}`, background: "var(--bg-3)" }}>
                  <span style={{ padding: "0 10px", display: "flex", alignItems: "center", background: "var(--bg-4)", color: "var(--text-3)", fontSize: 13, fontWeight: 600, borderRight: "1px solid var(--line-strong)", flexShrink: 0, userSelect: "none" }}>+63</span>
                  <input
                    id="ck-phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setPhone(digits);
                      if (phoneErr) setPhoneErr("");
                      if (topErr) setTopErr(null);
                    }}
                    placeholder="9171234567"
                    style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "10px 12px", color: "var(--text-1)", fontSize: 14 }}
                  />
                </div>
                {phoneErr
                  ? <div style={{ color: "var(--err)", fontSize: 12, marginTop: 4 }}>{phoneErr}</div>
                  : <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 3 }}>{phoneHelperText}</div>}
              </div>

              {/* Top error banner */}
              {topErr && (
                <div style={{ padding: "10px 14px", background: "rgba(255,107,94,0.1)", border: "1px solid rgba(255,107,94,0.3)", borderRadius: 10, color: "var(--err)", fontSize: 13 }}>
                  {topErr}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-block"
                style={{ opacity: isFormReady ? 1 : 0.65, transition: "opacity 0.2s" }}
                disabled={!isFormReady}
              >
                {isFormReady
                  ? (type === "order" ? "Track order" : "Track booking")
                  : "Enter required details"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
