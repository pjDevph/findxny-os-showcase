"use client";
export const dynamic = "force-dynamic";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cart } from "@/lib/cart";

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={null}>
      <PaymentCallbackInner />
    </Suspense>
  );
}

function PaymentCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const status  = params.get("status");
  const orderNo = params.get("order_no") ?? "";
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (status !== "success") return;
    cart.clear();
    const iv = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(iv);
          router.replace(`/order-tracking/${encodeURIComponent(orderNo)}`);
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [status, orderNo, router]);

  if (status === "success") {
    return (
      <div className="container" style={{ padding: "80px 0", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h1 className="h2">Payment confirmed!</h1>
        <p style={{ color: "var(--text-3)", marginTop: 8 }}>
          Redirecting to your order in {countdown}…
        </p>
        <Link href={`/order-tracking/${encodeURIComponent(orderNo)}`}
          className="btn btn-primary" style={{ marginTop: 24 }}>
          View order now
        </Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: "80px 0", textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✕</div>
      <h1 className="h2">Payment not completed</h1>
      <p style={{ color: "var(--text-3)", marginTop: 8 }}>
        Your order was not charged. You can try again or choose a different method.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
        <Link href="/checkout" className="btn btn-primary">Try again</Link>
        <Link href="/menu" className="btn btn-ghost">Back to menu</Link>
      </div>
    </div>
  );
}
