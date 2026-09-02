/**
 * Customer Display — presentational view
 *
 * Pure component driven entirely by props so the EXACT same UI renders in:
 *   1. the in-app Settings preview (scaled down), and
 *   2. the physical second screen (full-size, via ReactHost surface).
 *
 * No navigation / safe-area / context deps — it must stand alone on a second
 * React root. Colors come from design tokens + the config accent override.
 * Idle/logo media come via the `images` prop (see ./images).
 */
import { View, Text, Image, ScrollView, StyleSheet, Animated, StyleProp, ViewStyle, ImageStyle, useWindowDimensions } from "react-native";
import { useMemo, useState, useEffect, useRef } from "react";
import { VideoView, useVideoPlayer } from "expo-video";
import { C, R } from "../theme/tokens";
import type { CdSnapshot } from "./store";
import type { CustomerDisplayConfig, Slide, SlideFit } from "./config";
import { IDLE_IMAGE_KEY, QR_IMAGE_KEY, LOGO_IMAGE_KEY, secondSlideImageKey } from "./config";
import type { MediaKind } from "./media";

type Images = Record<string, string>;

const peso = (n: number) => `₱${(n ?? 0).toFixed(2)}`;
const PAY_LABEL: Record<string, string> = {
  cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph",
};
const IDLE_LOGO_SIZE: Record<string, number> = { s: 110, m: 152, l: 200 };

/** Fill the container with an image or a looping, muted video. */
function MediaFill({ uri, kind, style, fit }: Readonly<{ uri: string; kind: MediaKind; style: StyleProp<ViewStyle>; fit?: SlideFit }>) {
  if (kind === "video") return <VideoMedia uri={uri} style={style} />;
  return <Image source={{ uri }} style={style as StyleProp<ImageStyle>} resizeMode={fit ?? "cover"} />;
}

function VideoMedia({ uri, style }: Readonly<{ uri: string; style: StyleProp<ViewStyle> }>) {
  // textureView so playback respects transforms/clipping (e.g. the scaled preview).
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={style} contentFit="cover" nativeControls={false} surfaceType="textureView" />;
}

export function CustomerDisplayView({
  state, config, images,
}: Readonly<{ state: CdSnapshot; config: CustomerDisplayConfig; images: Images }>) {
  const accent = config.accent?.trim() || C.amber;
  const { width, height } = useWindowDimensions();
  const portrait = width < height || width < 480;
  const s = useMemo(() => makeStyles(accent), [accent]);
  const p = { config, images, accent, s, portrait };

  return (
    <View style={s.root}>
      {state.mode === "idle"     && <IdleScreen {...p} />}
      {state.mode === "order"    && <OrderScreen state={state} {...p} />}
      {state.mode === "payment"  && <PaymentScreen state={state} {...p} />}
      {state.mode === "thankyou" && <ThankYouScreen state={state} {...p} />}
    </View>
  );
}

/* ── Brand mark (uploaded logo OR letter tile) ── */
function Logo({ config, images, accent, size, radius }: Readonly<{
  config: CustomerDisplayConfig; images: Images; accent: string; size: number; radius?: number;
}>) {
  const uri = config.logoMode === "image" ? images[LOGO_IMAGE_KEY] : undefined;
  const rad = radius ?? Math.round(size * 0.24);
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: rad }} resizeMode="contain" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: rad, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#000000", fontSize: Math.round(size * 0.5), fontWeight: "800" }}>
        {(config.businessName?.trim()?.[0] ?? "F").toUpperCase()}
      </Text>
    </View>
  );
}

/** Centered brand header — Idle and Thank You screens only. */
function BrandHeader({ config, images, accent, s }: Readonly<{ config: CustomerDisplayConfig; images: Images; accent: string; s: Styles }>) {
  return (
    <View style={s.brandHeader}>
      <Logo config={config} images={images} accent={accent} size={40} />
      <Text style={s.brandHeaderName} numberOfLines={1}>{config.businessName || "FINDXNY"}</Text>
      <View style={[s.brandRule, { backgroundColor: accent }]} />
    </View>
  );
}

/** Compact horizontal brand strip — Order and Payment screens.
 *  Pass `state` to show live clock + order number in the top-right corner. */
function CompactBrand({ config, images, accent, s, state }: Readonly<{
  config: CustomerDisplayConfig; images: Images; accent: string; s: Styles; state?: CdSnapshot;
}>) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <View style={s.compactBrand}>
      <Logo config={config} images={images} accent={accent} size={34} radius={9} />
      <Text style={[s.compactBrandName, { flex: 1 }]} numberOfLines={1}>{config.businessName || "FINDXNY"}</Text>
      {state && (
        <View style={s.orderCtx}>
          {!!state.orderNo && <Text style={s.orderCtxNo}>Order #{state.orderNo}</Text>}
          <Text style={s.orderCtxTime}>{dateStr} · {timeStr}</Text>
        </View>
      )}
    </View>
  );
}

/* ── Idle (mode-driven) ── */
function IdleScreen({ config, images, accent, s }: Readonly<{ config: CustomerDisplayConfig; images: Images; accent: string; s: Styles }>) {
  if (config.idleMode === "image") {
    const uri = images[IDLE_IMAGE_KEY];
    if (!uri) return <LogoIdle config={config} images={images} accent={accent} s={s} />;
    return <MediaFill uri={uri} kind={config.idleMediaKind} style={s.idleImage} />;
  }
  if (config.idleMode === "qr") {
    const uri = images[QR_IMAGE_KEY];
    return (
      <View style={s.qrIdleWrap}>
        <Logo config={config} images={images} accent={accent} size={64} />
        <Text style={[s.qrIdleHeadline, { color: accent }]}>{config.qrCaption || "Scan to order"}</Text>
        {uri
          ? <Image source={{ uri }} style={s.qrIdleImg} resizeMode="contain" />
          : <View style={s.qrIdlePlaceholder}><Text style={s.qrIdlePlaceholderTxt}>Upload a QR code in Settings</Text></View>}
        <Text style={s.qrIdleBrand}>{config.businessName || "FINDXNY"}</Text>
      </View>
    );
  }
  if (config.idleMode === "slideshow") {
    return <SlideshowIdle slides={config.slides} images={images} config={config} accent={accent} s={s} />;
  }
  return <LogoIdle config={config} images={images} accent={accent} s={s} />;
}

function LogoIdle({ config, images, accent, s }: Readonly<{ config: CustomerDisplayConfig; images: Images; accent: string; s: Styles }>) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  return (
    <View style={s.idleWrap}>
      <Logo config={config} images={images} accent={accent} size={IDLE_LOGO_SIZE[config.logoSize] ?? 152} radius={R.xl} />
      <Text style={s.idleName}>{config.businessName || "FINDXNY"}</Text>
      {!!config.tagline && <Text style={s.idleTagline}>{config.tagline}</Text>}
      <View style={s.idleClock}>
        <Text style={s.idleClockTime}>{timeStr}</Text>
        <Text style={s.idleClockDate}>{dateStr}</Text>
      </View>
    </View>
  );
}

/* ── Slideshow ── */
function SlideshowIdle({ slides, images, config, accent, s }: Readonly<{
  slides: Slide[]; images: Images; config: CustomerDisplayConfig; accent: string; s: Styles;
}>) {
  const enabled = useMemo(() => slides.filter((sl) => sl.enabled), [slides]);
  const [idx, setIdx] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  // Reset to the first slide whenever the slide set changes.
  useEffect(() => { setIdx(0); opacity.setValue(1); }, [enabled.length, opacity]);

  function fadeToNextSlide() {
    Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
      setIdx((i) => (i + 1) % enabled.length);
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    });
  }

  // Advance with a fade after the current slide's duration.
  useEffect(() => {
    if (enabled.length <= 1) return;
    const cur = enabled[Math.min(idx, enabled.length - 1)];
    const ms = Math.max(2, cur?.duration || 8) * 1000;
    const t = setTimeout(fadeToNextSlide, ms);
    return () => clearTimeout(t);
  }, [idx, enabled.length, opacity]);

  if (enabled.length === 0) return <LogoIdle config={config} images={images} accent={accent} s={s} />;

  const slide = enabled[Math.min(idx, enabled.length - 1)];
  const img = images[slide.id];
  const img2 = images[secondSlideImageKey(slide.id)];
  const isSplit = slide.layout === "split" && slide.kind === "image";

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={{ flex: 1, opacity }}>
        {isSplit ? (
          <View style={s.slideSplitRow}>
            {img
              ? <MediaFill uri={img} kind="image" fit={slide.fit} style={s.slideSplitHalf} />
              : <View style={[s.slideFallback, s.slideSplitHalf]} />}
            {img2
              ? <MediaFill uri={img2} kind="image" fit={slide.fit} style={s.slideSplitHalf} />
              : <View style={[s.slideFallback, s.slideSplitHalf]} />}
          </View>
        ) : img
          ? <MediaFill uri={img} kind={slide.kind} fit={slide.fit} style={s.idleImage} />
          : <View style={s.slideFallback}><Text style={s.slideFallbackTxt}>{slide.title || config.businessName}</Text></View>}
        {(slide.title || slide.subtitle) ? (
          <View style={s.slideCaption}>
            {!!slide.title && <Text style={s.slideTitle}>{slide.title}</Text>}
            {!!slide.subtitle && <Text style={s.slideSubtitle}>{slide.subtitle}</Text>}
          </View>
        ) : null}
      </Animated.View>
      {config.showSlideIndicators && enabled.length > 1 && (
        <View style={s.dots}>
          {enabled.map((sl, i) => (
            <View key={sl.id} style={[s.dot, i === idx && { backgroundColor: accent, width: 26 }]} />
          ))}
        </View>
      )}
    </View>
  );
}

/* ── Order (live cart) — items left, total right ── */
function OrderScreen({ state, config, images, accent, s, portrait }: Readonly<{ state: CdSnapshot; config: CustomerDisplayConfig; images: Images; accent: string; s: Styles; portrait: boolean }>) {
  const itemList = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.itemsList} showsVerticalScrollIndicator={false}>
      {state.lines.length === 0 && state.bookings.length === 0 && (
        <Text style={s.emptyHint}>Your order will appear here…</Text>
      )}
      {state.lines.map((l, i) => (
        <View key={`${l.name}-${i}`} style={s.itemRow}>
          <Text style={s.itemQty}>{l.qty}×</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.itemName} numberOfLines={1}>{l.name}</Text>
            {!!l.note && <Text style={s.itemNote} numberOfLines={1}>{l.note}</Text>}
          </View>
          <Text style={s.itemPrice}>{peso(l.price * l.qty)}</Text>
        </View>
      ))}
      {state.bookings.map((b, i) => (
        <View key={`b-${b.name}-${i}`} style={s.itemRow}>
          <Text style={s.itemQty}>•</Text>
          <Text style={[s.itemName, { flex: 1 }]} numberOfLines={1}>{b.name}</Text>
          <Text style={s.itemPrice}>{peso(b.total)}</Text>
        </View>
      ))}
    </ScrollView>
  );

  const totalCard = config.showTotals ? (
    <View style={[s.orderRight, portrait && { flex: 0, marginTop: 12 }]}>
      {config.showTaxBreakdown && (
        <>
          <SumRow label="Subtotal" value={peso(state.subtotal)} s={s} />
          {state.tax > 0     && <SumRow label="VAT"      value={peso(state.tax)}           s={s} />}
          {state.service > 0  && <SumRow label="Service Charge" value={peso(state.service)}   s={s} />}
          {state.discount > 0 && <SumRow label="Discount" value={`−${peso(state.discount)}`} s={s} muted />}
          <View style={s.sumDivider} />
        </>
      )}
      <Text style={s.totalLabel}>TOTAL</Text>
      <Text style={[s.totalValue, { color: accent }, portrait && { fontSize: 52 }]} adjustsFontSizeToFit numberOfLines={1}>{peso(state.total)}</Text>
      <Text style={s.totalCount}>{state.itemCount} item{state.itemCount !== 1 ? "s" : ""}</Text>
    </View>
  ) : null;

  return (
    <View style={s.screen}>
      <CompactBrand config={config} images={images} accent={accent} s={s} state={state} />
      {portrait ? (
        <>
          {config.showItems && itemList}
          {totalCard}
        </>
      ) : (
        <View style={s.orderBody}>
          <View style={s.orderLeft}>{config.showItems ? itemList : <View style={{ flex: 1 }} />}</View>
          {totalCard}
        </View>
      )}
      <Text style={s.orderFooter}>Please review your order before payment.</Text>
    </View>
  );
}

function SumRow({ label, value, s, muted }: Readonly<{ label: string; value: string; s: Styles; muted?: boolean }>) {
  return (
    <View style={s.sumRow}>
      <Text style={s.sumLabel}>{label}</Text>
      <Text style={[s.sumValue, muted && { color: C.good }]}>{value}</Text>
    </View>
  );
}

/* ── Payment — amount left, payment action right, method-aware ── */
function PaymentScreen({ state, config, images, accent, s, portrait }: Readonly<{ state: CdSnapshot; config: CustomerDisplayConfig; images: Images; accent: string; s: Styles; portrait: boolean }>) {
  const isCash  = !state.payMethod || state.payMethod === "cash";
  const isCard  = state.payMethod === "card";
  const isQrPay = state.payMethod === "gcash" || state.payMethod === "maya" || state.payMethod === "qrph";
  const showQr  = config.showPaymentQr && !!state.payQr;
  const methodLabel = PAY_LABEL[state.payMethod ?? ""] ?? (state.payMethod ?? "");

  const statusText =
    isQrPay ? "Scan QR or send to the number below." :
    isCard  ? "Please tap, insert, or swipe your card." :
    "Please pay at the counter.";

  const footerText =
    isQrPay ? "Please show proof of payment to the cashier." :
    isCard  ? "Waiting for terminal confirmation…"             :
    "Cashier will enter the amount received.";

  const amountSection = (
    <View style={[s.payLeft, portrait && { alignItems: "center" }]}>
      <Text style={s.payDueLabel}>AMOUNT DUE</Text>
      <Text style={[s.payDueValue, { color: accent }, portrait && { fontSize: 64 }]} adjustsFontSizeToFit numberOfLines={1}>
        {peso(state.total)}
      </Text>
      <Text style={[s.payStatus, portrait && { textAlign: "center" }]}>{statusText}</Text>
    </View>
  );

  const actionCard = (
    <View style={[s.payRight, portrait && { flex: 0 }]}>
      {isCash && (
        <View style={[s.payActionCard, portrait && { paddingVertical: 20 }]}>
          <Text style={s.payActionTitle}>CASH PAYMENT</Text>
          <Text style={s.payActionInstruct}>Cashier will collect{"\n"}your payment.</Text>
        </View>
      )}
      {isCard && (
        <View style={[s.payActionCard, portrait && { paddingVertical: 20 }]}>
          <Text style={s.payActionTitle}>CARD PAYMENT</Text>
          <Text style={s.payActionInstruct}>Please tap, insert,{"\n"}or swipe your card.</Text>
        </View>
      )}
      {isQrPay && (
        <View style={[s.payActionCard, portrait && { paddingVertical: 20 }]}>
          <Text style={[s.payActionTitle, { color: accent }]}>PAY WITH {methodLabel.toUpperCase()}</Text>
          {showQr
            ? <Image source={{ uri: state.payQr! }} style={s.payQrLarge} resizeMode="contain" />
            : (
              <View style={s.payQrPlaceholder}>
                <Text style={s.payQrPlaceholderTxt}>{"QR not configured\nAsk cashier to confirm"}</Text>
              </View>
            )
          }
          {!!state.payInfo    && <Text style={s.payInfoText}>{state.payInfo}</Text>}
          {!!config.businessName && <Text style={s.payAccountName}>Account: {config.businessName}</Text>}
        </View>
      )}
    </View>
  );

  return (
    <View style={s.screen}>
      <CompactBrand config={config} images={images} accent={accent} s={s} state={state} />
      {portrait ? (
        <>
          {amountSection}
          {actionCard}
        </>
      ) : (
        <View style={s.payBody}>
          {amountSection}
          {actionCard}
        </View>
      )}
      <Text style={s.payFooter}>{footerText}</Text>
    </View>
  );
}

/* ── Thank you ── */
function ThankYouScreen({ state, config, images, accent, s }: Readonly<{ state: CdSnapshot; config: CustomerDisplayConfig; images: Images; accent: string; s: Styles }>) {
  const showChange = (state.payMethod === "cash" || !state.payMethod) && state.change != null && state.change > 0;
  const methodLabel = PAY_LABEL[state.payMethod ?? ""] ?? (state.payMethod ?? "Cash");

  return (
    <View style={s.screen}>
      {/* compact top bar — smaller branding */}
      <View style={s.tyTopBar}>
        <Logo config={config} images={images} accent={accent} size={28} radius={7} />
        <Text style={s.tyBrandName} numberOfLines={1}>{config.businessName || "FINDXNY"}</Text>
      </View>

      <View style={s.tyCenter}>
        {/* Check + heading */}
        <View style={s.tyCheckRow}>
          <View style={[s.tyCheck, { backgroundColor: accent }]}>
            <Text style={s.tyCheckMark}>✓</Text>
          </View>
          <Text style={s.tyHeading}>PAYMENT{"\n"}COMPLETE</Text>
        </View>

        {/* Hero: change due */}
        {showChange ? (
          <View style={s.tyChangeHero}>
            <Text style={s.tyChangeDueLabel}>CHANGE DUE</Text>
            <Text style={[s.tyChangeDueValue, { color: accent }]}>{peso(state.change!)}</Text>
          </View>
        ) : (
          <View style={[s.tyChangeHero, { borderColor: accent }]}>
            <Text style={[s.tyChangeDueLabel, { color: accent }]}>PAID IN FULL</Text>
          </View>
        )}

        {/* Transaction summary */}
        <View style={s.tyMeta}>
          {!!state.orderNo && <Text style={s.tyMetaLine}>Order #{state.orderNo}</Text>}
          <Text style={s.tyMetaLine}>
            {methodLabel}
            {state.cashTendered != null ? `  ·  Paid ${peso(state.cashTendered)}` : ""}
            {state.total > 0 ? `  ·  Total ${peso(state.total)}` : ""}
          </Text>
        </View>

        {/* Customer-facing message */}
        <Text style={s.tyMsg}>{config.thankYouMessage || "Thank you! Please come again."}</Text>
      </View>
    </View>
  );
}

/* ── Styles ── */
type Styles = ReturnType<typeof makeStyles>;
const makeStyles = (accent: string) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  screen: { flex: 1, padding: 28 },

  /* centered brand header (idle + thank you) */
  brandHeader:     { alignItems: "center", gap: 6, marginBottom: 12 },
  brandHeaderName: { color: C.ink, fontSize: 20, fontWeight: "800", letterSpacing: 0.4, textAlign: "center" },
  brandRule:       { width: 52, height: 3, borderRadius: 2 },

  /* compact brand strip (order + payment) */
  compactBrand:     { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  compactBrandName: { color: C.ink3, fontSize: 16, fontWeight: "700" },
  orderCtx:         { alignItems: "flex-end" },
  orderCtxNo:       { color: C.ink2, fontSize: 14, fontWeight: "700" },
  orderCtxTime:     { color: C.ink4, fontSize: 13 },
  orderFooter:      { color: C.ink4, fontSize: 14, textAlign: "center", marginTop: 12 },

  /* idle - logo + clock */
  idleWrap:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, padding: 28 },
  idleClock:     { alignItems: "center", marginTop: 8 },
  idleClockTime: { color: C.ink2, fontSize: 52, fontWeight: "300", letterSpacing: 2, textAlign: "center" },
  idleClockDate: { color: C.ink4, fontSize: 20, marginTop: 4, textAlign: "center" },
  idleImage:   { width: "100%", height: "100%" },
  idleName:    { color: C.ink, fontSize: 42, fontWeight: "800", letterSpacing: 0.5, textAlign: "center" },
  idleTagline: { color: C.ink3, fontSize: 22, textAlign: "center" },

  /* idle - slideshow */
  slideSplitRow:    { flex: 1, flexDirection: "row" },
  slideSplitHalf:   { flex: 1, height: "100%" },
  slideFallback:    { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  slideFallbackTxt: { color: C.ink2, fontSize: 32, fontWeight: "800", paddingHorizontal: 40, textAlign: "center" },
  slideCaption:     { position: "absolute", left: 0, right: 0, bottom: 0, padding: 28, backgroundColor: "rgba(20,16,11,0.55)" },
  slideTitle:       { color: "#fff", fontSize: 34, fontWeight: "900" },
  slideSubtitle:    { color: "#e8e2d8", fontSize: 20, marginTop: 4 },
  dots: { position: "absolute", bottom: 14, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 8 },
  dot:  { width: 10, height: 10, borderRadius: R.full, backgroundColor: "rgba(255,255,255,0.45)" },

  /* idle - qr ordering */
  qrIdleWrap:           { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, padding: 28 },
  qrIdleHeadline:       { fontSize: 40, fontWeight: "900", letterSpacing: 0.3, textAlign: "center" },
  qrIdleImg:            { width: 320, height: 320, borderRadius: R.lg, backgroundColor: "#fff" },
  qrIdlePlaceholder:    { width: 320, height: 320, borderRadius: R.lg, borderWidth: 2, borderColor: C.line, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  qrIdlePlaceholderTxt: { color: C.ink4, fontSize: 16, textAlign: "center", paddingHorizontal: 24 },
  qrIdleBrand:          { color: C.ink3, fontSize: 22, fontWeight: "700" },

  /* order */
  orderBody:  { flex: 1, flexDirection: "row", gap: 24 },
  orderLeft:  { flex: 1.4 },
  itemsList:  { gap: 16, paddingVertical: 4 },
  emptyHint:  { color: C.ink4, fontSize: 22, marginTop: 24 },
  itemRow:    { flexDirection: "row", alignItems: "center", gap: 12 },
  itemQty:    { color: accent, fontSize: 26, fontWeight: "800", minWidth: 50 },
  itemName:   { color: C.ink, fontSize: 24, fontWeight: "600" },
  itemNote:   { color: C.ink4, fontSize: 16, marginTop: 1 },
  itemPrice:  { color: C.ink, fontSize: 24, fontWeight: "700" },

  orderRight: {
    flex: 1, backgroundColor: C.surface, borderRadius: R.xl,
    borderWidth: 1, borderColor: C.line, padding: 28, justifyContent: "center",
  },
  sumRow:     { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  sumLabel:   { color: C.ink3, fontSize: 20 },
  sumValue:   { color: C.ink, fontSize: 20, fontWeight: "600" },
  sumDivider: { height: 1, backgroundColor: C.line, marginVertical: 16 },
  totalLabel: { color: C.ink4, fontSize: 17, letterSpacing: 2.5, fontWeight: "700" },
  totalValue: { fontSize: 76, fontWeight: "900", marginTop: 6 },
  totalCount: { color: C.ink3, fontSize: 18, marginTop: 8 },

  /* payment */
  payBody:  { flex: 1, flexDirection: "row", gap: 28 },
  payLeft:  { flex: 1, justifyContent: "center" },
  payRight: { flex: 1 },

  payDueLabel: { color: C.ink4, fontSize: 22, letterSpacing: 3, fontWeight: "700" },
  payDueValue: { fontSize: 90, fontWeight: "900" },
  payStatus:   { color: C.ink3, fontSize: 18, marginTop: 18, lineHeight: 26 },

  payActionCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: R.xl,
    borderWidth: 1, borderColor: C.line,
    padding: 28, alignItems: "center", justifyContent: "center", gap: 16,
  },
  payActionTitle:    { color: C.ink3, fontSize: 13, fontWeight: "700", letterSpacing: 1.8 },
  payActionInstruct: { color: C.ink2, fontSize: 22, textAlign: "center", fontWeight: "600", lineHeight: 32 },

  payQrLarge:        { width: 220, height: 220, borderRadius: R.lg, backgroundColor: "#fff" },
  payQrPlaceholder:  { width: 200, height: 200, borderRadius: R.lg, borderWidth: 2, borderColor: C.line, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  payQrPlaceholderTxt: { color: C.ink4, fontSize: 14, textAlign: "center", paddingHorizontal: 16 },
  payInfoText:       { color: C.ink2, fontSize: 20, textAlign: "center", fontWeight: "700" },
  payAccountName:    { color: C.ink4, fontSize: 16 },
  payFooter:         { color: C.ink4, fontSize: 14, textAlign: "center", marginTop: 10 },

  /* thank you */
  tyTopBar:          { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  tyBrandName:       { color: C.ink3, fontSize: 15, fontWeight: "700", flex: 1 },
  tyCenter:          { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  tyCheckRow:        { flexDirection: "row", alignItems: "center", gap: 20 },
  tyCheck:           { width: 72, height: 72, borderRadius: R.full, alignItems: "center", justifyContent: "center" },
  tyCheckMark:       { color: "#000000", fontSize: 44, fontWeight: "900" },
  tyHeading:         { color: C.ink, fontSize: 36, fontWeight: "900", letterSpacing: 0.5 },
  tyChangeHero:      { alignItems: "center", backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 2, borderColor: C.line, paddingHorizontal: 48, paddingVertical: 20, alignSelf: "center", minWidth: 260, maxWidth: 420 },
  tyChangeDueLabel:  { color: C.ink4, fontSize: 15, letterSpacing: 2.5, fontWeight: "700" },
  tyChangeDueValue:  { fontSize: 72, fontWeight: "900", marginTop: 2 },
  tyMeta:            { alignItems: "center", gap: 4 },
  tyMetaLine:        { color: C.ink3, fontSize: 14, textAlign: "center" },
  tyMsg:             { color: C.ink2, fontSize: 18, fontWeight: "600", textAlign: "center" },
});
