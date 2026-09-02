import { useEffect, useState, useMemo, useCallback } from "react";
import {
  View, Text, Pressable, TextInput, Switch, StyleSheet, Modal,
  LayoutChangeEvent, Platform, useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import { useToast } from "../ui/ToastProvider";
import {
  useCustomerDisplayConfig, updateCustomerDisplayConfig,
  hydrateCustomerDisplayConfig, CustomerDisplayConfig, IdleMode,
  IDLE_IMAGE_KEY, QR_IMAGE_KEY, LOGO_IMAGE_KEY,
} from "./config";
import { useImages, hydrateImages, setImage } from "./images";
import { pickMedia } from "./media";
import { CustomerDisplayView } from "./CustomerDisplayView";
import { SlideManager } from "./SlideManager";
import type { CdSnapshot } from "./store";
import { setCustomerDisplay, resetCustomerDisplay } from "./store";
import { CustomerDisplayNative } from "../../modules/customer-display";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

const Native = CustomerDisplayNative;

const DESIGN_W = 1000;
const DESIGN_H = 625;

const ACCENTS = ["", "#111111", "#333333", "#5c5c5c", "#8a8a8a", "#cccccc", "#e5e5e5"];

type PreviewMode = "idle" | "order" | "payment" | "thankyou";

const PREVIEW_MODES: { id: PreviewMode; label: string }[] = [
  { id: "idle",     label: "Idle"    },
  { id: "order",    label: "Order"   },
  { id: "payment",  label: "Payment" },
  { id: "thankyou", label: "Thanks"  },
];

const IDLE_MODES: { id: IdleMode; label: string }[] = [
  { id: "logo",      label: "Logo"      },
  { id: "slideshow", label: "Slideshow" },
  { id: "image",     label: "Promo"     },
  { id: "qr",        label: "QR Order"  },
];

function sampleSnapshot(mode: PreviewMode): CdSnapshot {
  const base: CdSnapshot = {
    mode: "idle", lines: [], bookings: [], subtotal: 0, tax: 0, service: 0,
    discount: 0, total: 0, itemCount: 0, payMethod: null, payInfo: null,
    payQr: null, orderNo: null, change: null, customerName: null, updatedAt: 1,
  };
  if (mode === "idle") return base;
  const lines    = [{ name: "Cappuccino", qty: 2, price: 140 }, { name: "Blueberry Muffin", qty: 1, price: 95, note: "warmed" }];
  const bookings = [{ name: "Room 2 · 2 nights", total: 3000 }];
  const subtotal = 3375, tax = 45, service = 37.5, total = 3457.5;
  if (mode === "order")   return { ...base, mode, lines, bookings, subtotal, tax, service, total, itemCount: 4 };
  if (mode === "payment") return { ...base, mode: "payment", total, payMethod: "gcash", payInfo: "GCash  0917 123 4567" };
  return { ...base, mode: "thankyou", total, orderNo: "042", change: 42.5, cashTendered: 3500, payMethod: "cash" };
}

/* ── Main component ──────────────────────────────────────────────── */

export function CustomerDisplaySettings() {
  const { C }     = useTheme();
  const { width } = useWindowDimensions();
  const s         = useMemo(() => makeStyles(C), [C]);
  const config    = useCustomerDisplayConfig();
  const images    = useImages();
  const isTwoCol  = width >= 760;

  const [previewMode,  setPreviewMode]  = useState<PreviewMode>("payment");
  const [boxW,         setBoxW]         = useState(0);
  const [secondScreen, setSecondScreen] = useState<boolean | null>(null);
  const [fullscreen,   setFullscreen]   = useState(false);
  const { showToast } = useToast();

  useEffect(() => { void hydrateCustomerDisplayConfig(); void hydrateImages(); }, []);

  useEffect(() => {
    let alive = true;
    if (Native?.isPresent) {
      Native.isPresent()
        .then(v  => { if (alive) setSecondScreen(v);     })
        .catch(() => { if (alive) setSecondScreen(false); });
    } else {
      setSecondScreen(null);
    }
    return () => { alive = false; };
  }, []);

  const set = useCallback((patch: Partial<CustomerDisplayConfig>) => {
    void updateCustomerDisplayConfig(patch);
  }, []);

  const toggleEnabled = useCallback((v: boolean) => {
    set({ enabled: v });
    try { Native?.setEnabled?.(v); } catch { /* no-op */ }
  }, [set]);

  const pickImageFor = useCallback(async (key: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { showToast({ title: "Permission needed", message: "Allow photo access to set an image.", type: "error" }); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.5, base64: true });
    if (!res.canceled && res.assets[0]?.base64) {
      await setImage(key, `data:image/jpeg;base64,${res.assets[0].base64}`);
    }
  }, []);

  const pickPromo = useCallback(async () => {
    const kind = await pickMedia(IDLE_IMAGE_KEY);
    if (kind) set({ idleMediaKind: kind });
  }, [set]);

  const scale    = boxW > 0 ? boxW / DESIGN_W : 0;
  const snapshot = sampleSnapshot(previewMode);

  // Mirror whatever preview tab is selected onto the REAL customer-facing
  // screen too, so switching tabs here doubles as a live test — the physical
  // second screen shares the same JS runtime/store as this settings screen.
  useEffect(() => {
    setCustomerDisplay(sampleSnapshot(previewMode));
  }, [previewMode]);

  // Only revert to idle on true unmount (leaving Settings) — not on every
  // tab switch — so switching tabs doesn't flash back to idle in between.
  useEffect(() => {
    return () => resetCustomerDisplay();
  }, []);

  const statusLabel =
    secondScreen === true  ? "Connected" :
    secondScreen === false ? "Not connected" :
    "Preview only";
  const statusSub =
    secondScreen === true  ? "Customer-facing screen is live." :
    secondScreen === false ? "Connect a second screen to start displaying." :
    "Customer display device is not connected yet.";

  /* ── Preview panel ──────────────────────────────────────────────── */

  function renderPreview() {
    return (
      <View style={s.previewCard}>
        {/* Card header */}
        <View style={s.previewCardHead}>
          <Text style={s.previewCardTitle}>Live Preview</Text>
          <View style={[s.statusDot, {
            backgroundColor: secondScreen === true ? C.good : secondScreen === false ? C.bad : C.ink4,
          }]} />
          <Text style={s.statusLabel}>{statusLabel}</Text>
          <Pressable style={s.fullscreenBtn} onPress={() => setFullscreen(true)} hitSlop={8}>
            <Feather name="maximize" size={13} color={C.ink4} />
          </Pressable>
        </View>

        {/* Mode tabs — inside the preview card */}
        <View style={s.modeBar}>
          {PREVIEW_MODES.map(m => (
            <Pressable key={m.id}
              style={[s.modeTab, previewMode === m.id && s.modeTabActive]}
              onPress={() => setPreviewMode(m.id)}>
              <Text style={[s.modeTabText, previewMode === m.id && { color: C.amber }]}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Preview frame */}
        <View style={s.previewFrame}
          onLayout={(e: LayoutChangeEvent) => setBoxW(e.nativeEvent.layout.width)}>
          {scale > 0 && (
            <View style={{ width: boxW, height: DESIGN_H * scale, overflow: "hidden" }}>
              <View style={{ width: DESIGN_W, height: DESIGN_H, transform: [{ scale }], transformOrigin: "top left" }}>
                <CustomerDisplayView state={snapshot} config={config} images={images} />
              </View>
            </View>
          )}
        </View>

        <Text style={s.previewHint}>
          {secondScreen === true
            ? "Also shown live on the connected customer screen — try switching tabs"
            : "Exactly what the customer screen shows"}
        </Text>

        {/* Fullscreen preview modal */}
        <Modal visible={fullscreen} onRequestClose={() => setFullscreen(false)} statusBarTranslucent>
          <View style={{ flex: 1, backgroundColor: C.bg }}>
            <CustomerDisplayView state={snapshot} config={config} images={images} />
            <Pressable style={s.fullscreenClose} onPress={() => setFullscreen(false)} hitSlop={16}>
              <Feather name="x" size={18} color="#fff" />
            </Pressable>
          </View>
        </Modal>
      </View>
    );
  }

  /* ── Settings sections ──────────────────────────────────────────── */

  function renderSettings() {
    return (
      <View style={{ gap: 20 }}>

        {/* Status */}
        <View style={s.card}>
          <View style={s.statusRow}>
            <View style={[s.statusIcon, { backgroundColor: config.enabled ? `${C.amber}18` : `${C.ink4}12` }]}>
              <Feather name="monitor" size={16} color={config.enabled ? C.amber : C.ink4} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.statusTitle}>Customer-facing screen</Text>
              <Text style={s.statusSubText}>{statusSub}</Text>
            </View>
            <Switch
              value={config.enabled}
              onValueChange={toggleEnabled}
              trackColor={{ false: C.line, true: `${C.amber}66` }}
              thumbColor={config.enabled ? C.amber : C.ink3}
            />
          </View>
        </View>

        {/* Branding */}
        <View style={{ gap: 8 }}>
          <SectionLabel label="Branding" />
          <View style={s.card}>
            <Row label="Business name">
              <TextInput
                style={s.inlineInput}
                value={config.businessName}
                onChangeText={v => set({ businessName: v })}
                maxLength={40}
                placeholder="FINDXNY"
                placeholderTextColor={C.ink4}
              />
            </Row>

            <View style={s.divider} />

            <Row label="Logo">
              <View style={s.segRow}>
                <SegBtn label="Letter tile" active={config.logoMode === "letter"} C={C} s={s}
                  onPress={() => set({ logoMode: "letter" })} />
                <SegBtn label="Upload image" active={config.logoMode === "image"} C={C} s={s}
                  onPress={() => set({ logoMode: "image" })} />
              </View>
            </Row>
            {config.logoMode === "image" && (
              <Pressable style={s.uploadBtn} onPress={() => pickImageFor(LOGO_IMAGE_KEY)}>
                <Feather name="image" size={14} color={C.ink3} />
                <Text style={s.uploadBtnText}>
                  {images[LOGO_IMAGE_KEY] ? "Replace logo image" : "Choose logo image"}
                </Text>
              </Pressable>
            )}

            <View style={s.divider} />

            <Row label="Logo size">
              <View style={s.segRow}>
                {(["s", "m", "l"] as const).map(sz => (
                  <SegBtn key={sz}
                    label={sz === "s" ? "Small" : sz === "m" ? "Medium" : "Large"}
                    active={config.logoSize === sz} C={C} s={s}
                    onPress={() => set({ logoSize: sz })} />
                ))}
              </View>
            </Row>

            <View style={s.divider} />

            <Row label="Idle tagline">
              <TextInput
                style={s.inlineInput}
                value={config.tagline}
                onChangeText={v => set({ tagline: v })}
                maxLength={40}
                placeholder="Welcome"
                placeholderTextColor={C.ink4}
              />
            </Row>

            <View style={s.divider} />

            <View style={{ gap: 6 }}>
              <Text style={s.rowLabel}>Accent color</Text>
              <View style={s.swatchRow}>
                {ACCENTS.map(a => {
                  const active = config.accent === a;
                  const color  = a || C.amber;
                  return (
                    <Pressable key={a || "default"} onPress={() => set({ accent: a })}
                      style={[s.swatch, { backgroundColor: color }, active && s.swatchActive]}>
                      {a === "" && <Text style={s.swatchAuto}>A</Text>}
                      {active && a !== "" && <Feather name="check" size={11} color="#000000" />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {/* Idle Screen */}
        <View style={{ gap: 8 }}>
          <SectionLabel label="Idle Screen" />
          <View style={s.card}>
            <View style={{ gap: 6 }}>
              <Text style={s.rowLabel}>Mode</Text>
              <View style={s.segRow}>
                {IDLE_MODES.map(m => (
                  <SegBtn key={m.id} label={m.label}
                    active={config.idleMode === m.id} C={C} s={s}
                    onPress={() => set({ idleMode: m.id })} />
                ))}
              </View>
            </View>

            {config.idleMode === "image" && (
              <>
                <View style={s.divider} />
                <Pressable style={s.uploadBtn} onPress={pickPromo}>
                  <Feather name={config.idleMediaKind === "video" ? "film" : "image"} size={14} color={C.ink3} />
                  <Text style={s.uploadBtnText}>
                    {images[IDLE_IMAGE_KEY]
                      ? `Replace promo ${config.idleMediaKind === "video" ? "video" : "image"}`
                      : "Choose promo image or video"}
                  </Text>
                </Pressable>
              </>
            )}

            {config.idleMode === "qr" && (
              <>
                <View style={s.divider} />
                <Row label="Headline">
                  <TextInput
                    style={s.inlineInput}
                    value={config.qrCaption}
                    onChangeText={v => set({ qrCaption: v })}
                    maxLength={40}
                    placeholder="Scan to order"
                    placeholderTextColor={C.ink4}
                  />
                </Row>
                <View style={s.divider} />
                <Pressable style={s.uploadBtn} onPress={() => pickImageFor(QR_IMAGE_KEY)}>
                  <Feather name="maximize" size={14} color={C.ink3} />
                  <Text style={s.uploadBtnText}>
                    {images[QR_IMAGE_KEY] ? "Replace QR image" : "Upload QR code image"}
                  </Text>
                </Pressable>
              </>
            )}

            {config.idleMode === "slideshow" && (
              <>
                <View style={s.divider} />
                <SlideManager />
                <View style={s.divider} />
                <ToggleRow label="Show slide indicators" value={config.showSlideIndicators}
                  onChange={v => set({ showSlideIndicators: v })} C={C} s={s} />
              </>
            )}
          </View>
        </View>

        {/* Order Screen */}
        <View style={{ gap: 8 }}>
          <SectionLabel label="Order Screen" />
          <View style={s.card}>
            <ToggleRow label="Show item list"             value={config.showItems}        onChange={v => set({ showItems: v })}        C={C} s={s} />
            <View style={s.divider} />
            <ToggleRow label="Show totals"                value={config.showTotals}       onChange={v => set({ showTotals: v })}       C={C} s={s} />
            <View style={s.divider} />
            <ToggleRow label="Show tax / service details" value={config.showTaxBreakdown} onChange={v => set({ showTaxBreakdown: v })} C={C} s={s} />
          </View>
        </View>

        {/* Payment Screen */}
        <View style={{ gap: 8 }}>
          <SectionLabel label="Payment Screen" />
          <View style={s.card}>
            <ToggleRow label="Show payment QR on screen" value={config.showPaymentQr} onChange={v => set({ showPaymentQr: v })} C={C} s={s} />
          </View>
        </View>

        {/* Thank You Screen */}
        <View style={{ gap: 8 }}>
          <SectionLabel label="Thank You Screen" />
          <View style={s.card}>
            <View style={{ gap: 6 }}>
              <Text style={s.rowLabel}>Message</Text>
              <TextInput
                style={[s.inlineInput, { minHeight: 56, textAlignVertical: "top", paddingTop: 11 }]}
                multiline
                value={config.thankYouMessage}
                onChangeText={v => set({ thankYouMessage: v })}
                maxLength={200}
                placeholder="Thank you! Please come again."
                placeholderTextColor={C.ink4}
              />
            </View>
          </View>
        </View>

      </View>
    );
  }

  /* ── Main render ───────────────────────────────────────────────── */

  if (isTwoCol) {
    return (
      <View style={s.twoCol}>
        {/* Left: Settings (scrollable within the parent scroll context) */}
        <View style={s.settingsCol}>
          {renderSettings()}
        </View>

        {/* Right: Preview (stays at top of its column — visually sticky) */}
        <View style={s.previewCol}>
          {renderPreview()}
        </View>
      </View>
    );
  }

  // Single-column: preview on top, settings below
  return (
    <View style={{ gap: 14 }}>
      {renderPreview()}
      {renderSettings()}
    </View>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

type CType = ReturnType<typeof useTheme>["C"];
type S = ReturnType<typeof makeStyles>;

function SectionLabel({ label }: { label: string }) {
  const { C } = useTheme();
  return (
    <Text style={{ color: C.ink4, fontSize: 10, fontWeight: "700", letterSpacing: 1.1,
      textTransform: "uppercase", fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }) }}>
      {label}
    </Text>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const { C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 38 }}>
      <Text style={{ color: C.ink3, fontSize: 13, flex: 1 }}>{label}</Text>
      <View style={{ flex: 1.2, alignItems: "flex-end" }}>{children}</View>
    </View>
  );
}

function SegBtn({ label, active, onPress, C, s }: { label: string; active: boolean; onPress: () => void; C: CType; s: S }) {
  return (
    <Pressable style={[s.seg, active && s.segActive]} onPress={onPress}>
      <Text style={[s.segText, active && { color: C.amber }]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange, C, s }: {
  label: string; value: boolean; onChange: (v: boolean) => void; C: CType; s: S;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text style={{ color: C.ink2, fontSize: 13, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange}
        trackColor={{ false: C.line, true: `${C.amber}66` }}
        thumbColor={value ? C.amber : C.ink3} />
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────────── */

const makeStyles = (C: CType) => StyleSheet.create({
  /* ── Layout ── */
  twoCol: {
    flexDirection: "row", alignItems: "flex-start", gap: 20,
  },
  settingsCol: { flex: 1 },
  previewCol:  { flex: 0.82 },

  /* ── Cards ── */
  card: {
    backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line,
    padding: 14, gap: 12,
  },
  divider: { height: 1, backgroundColor: C.lineSoft },

  /* ── Status card ── */
  statusRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  statusIcon: {
    width: 38, height: 38, borderRadius: R.md,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: C.line,
  },
  statusTitle:   { color: C.ink, fontSize: 14, fontWeight: "700" },
  statusSubText: { color: C.ink4, fontSize: 11, marginTop: 2 },

  /* ── Inline row ── */
  rowLabel:    { color: C.ink3, fontSize: 12, fontWeight: "500" },
  inlineInput: {
    flex: 1, backgroundColor: C.bg, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 12, paddingVertical: 9,
    color: C.ink, fontSize: 13,
  },

  /* ── Segment controls ── */
  segRow:  { flexDirection: "row", gap: 6, flex: 1 },
  seg: {
    flex: 1, alignItems: "center", paddingVertical: 8,
    borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.bg,
  },
  segActive: { borderColor: C.amber, backgroundColor: `${C.amber}14` },
  segText:   { color: C.ink4, fontSize: 11, fontWeight: "600" },

  /* ── Upload button ── */
  uploadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 11, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line, borderStyle: "dashed",
    backgroundColor: C.bg,
  },
  uploadBtnText: { color: C.ink3, fontSize: 12 },

  /* ── Accent swatches ── */
  swatchRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  swatch: {
    width: 30, height: 30, borderRadius: R.full,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "transparent",
  },
  swatchActive: { borderColor: C.ink },
  swatchAuto:   { color: "#000000", fontSize: 12, fontWeight: "800" },

  /* ── Preview card ── */
  previewCard: {
    backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line,
    padding: 12, gap: 10,
  },
  previewCardHead: {
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  previewCardTitle: { color: C.ink, fontSize: 13, fontWeight: "700", flex: 1 },
  statusDot: {
    width: 7, height: 7, borderRadius: 4,
  },
  statusLabel: { color: C.ink4, fontSize: 11 },

  modeBar: { flexDirection: "row", gap: 6 },
  modeTab: {
    flex: 1, alignItems: "center", paddingVertical: 7,
    borderRadius: R.full, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.bg,
  },
  modeTabActive: { borderColor: C.amber, backgroundColor: `${C.amber}14` },
  modeTabText:   { color: C.ink4, fontSize: 11, fontWeight: "600" },

  previewFrame: {
    width: "100%", borderRadius: R.md, overflow: "hidden",
    borderWidth: 1, borderColor: C.line, backgroundColor: C.bg,
  },
  previewHint: {
    color: C.ink4, fontSize: 10, textAlign: "center",
    fontFamily: MONO,
  },

  fullscreenBtn: {
    width: 28, height: 28, borderRadius: R.md,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.line,
  },
  fullscreenClose: {
    position: "absolute", top: 20, right: 20,
    width: 44, height: 44, borderRadius: R.full,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
});
