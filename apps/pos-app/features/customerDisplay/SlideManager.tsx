/**
 * Customer Display — idle slideshow manager
 *
 * Add / edit / reorder / enable slides for the idle slideshow. Images are
 * stored per-slide in ./images (keyed by slide id). Kept intentionally simple
 * (no drag CMS): thumbnail, title, subtitle, duration, enable, up/down, delete.
 */
import { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, TextInput, Switch, Image, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import {
  useCustomerDisplayConfig, updateCustomerDisplayConfig, MAX_SLIDES, Slide, SlideFit, SlideLayout,
  secondSlideImageKey,
} from "./config";
import { useImages, setImage } from "./images";
import { pickMedia } from "./media";

// Matches the customer-display canvas (CustomerDisplaySettings.tsx's
// DESIGN_W/DESIGN_H, 1000×625) — an 8:5 landscape. A "split" slide splits
// that canvas into two equal-width halves, so each half is a 4:5 portrait
// slice, not another 8:5 landscape. The recommended px figures are just that
// ratio at a size sharp enough to fill a full-screen tablet display.
const SINGLE_ASPECT = 8 / 5;
const SPLIT_ASPECT  = 4 / 5;
const SINGLE_RES_HINT = "Best fit: landscape image, ~1600×1000px (8:5 ratio). A different ratio will crop (Fill) or letterbox (Fit).";
const SPLIT_RES_HINT  = "Each half is a portrait slice — best fit: ~800×1000px (4:5 ratio) per image.";

export function SlideManager() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { slides } = useCustomerDisplayConfig();
  const images = useImages();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const setSlides = useCallback((next: Slide[]) => updateCustomerDisplayConfig({ slides: next }), []);

  const addSlide = useCallback(() => {
    if (slides.length >= MAX_SLIDES) return;
    const id = `s_${Date.now()}_${Math.floor(Math.random() * 1e4)}`; // NOSONAR - non-security randomness
    setSlides([...slides, { id, title: "", subtitle: "", duration: 8, enabled: true, kind: "image" }]);
    setExpandedId(id);
  }, [slides, setSlides]);

  const patchSlide = useCallback((id: string, patch: Partial<Slide>) => {
    setSlides(slides.map((sl) => (sl.id === id ? { ...sl, ...patch } : sl)));
  }, [slides, setSlides]);

  const removeSlide = useCallback((id: string) => {
    setSlides(slides.filter((sl) => sl.id !== id));
    void setImage(id, null);
    void setImage(secondSlideImageKey(id), null);
    setExpandedId((e) => (e === id ? null : e));
  }, [slides, setSlides]);

  const move = useCallback((id: string, dir: -1 | 1) => {
    const i = slides.findIndex((sl) => sl.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    setSlides(next);
  }, [slides, setSlides]);

  const pickSlideMedia = useCallback(async (id: string) => {
    const kind = await pickMedia(id);
    if (!kind) return;
    // A "split" layout is two images side by side — video doesn't fit that
    // model (autoplay/sync across two players), so picking a video for the
    // primary slot falls back to the single-image layout and drops any
    // second image that was there.
    if (kind === "video") {
      patchSlide(id, { kind, layout: "single" });
      void setImage(secondSlideImageKey(id), null);
    } else {
      patchSlide(id, { kind });
    }
  }, [patchSlide]);

  const pickSecondSlideMedia = useCallback(async (id: string) => {
    // Second slot is always the right-hand image of a "split" slide — never
    // a video, so the kind result is discarded.
    await pickMedia(secondSlideImageKey(id));
  }, []);

  return (
    <View style={{ gap: 10 }}>
      {slides.length === 0 && (
        <Text style={s.empty}>No slides yet. Add up to {MAX_SLIDES} promo slides shown while idle.</Text>
      )}

      {slides.map((sl, i) => {
        const img = images[sl.id];
        const img2 = images[secondSlideImageKey(sl.id)];
        const open = expandedId === sl.id;
        const layout: SlideLayout = sl.layout ?? "single";
        const fit: SlideFit = sl.fit ?? "cover";
        return (
          <View key={sl.id} style={s.card}>
            <Pressable style={s.row} onPress={() => setExpandedId(open ? null : sl.id)}>
              <View style={s.thumb}>
                {sl.kind === "video"
                  ? <Feather name={img ? "play" : "film"} size={16} color={img ? C.amber : C.ink4} />
                  : (img ? <Image source={{ uri: img }} style={s.thumbImg} /> : <Feather name="image" size={16} color={C.ink4} />)}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{sl.title || `Slide ${i + 1}`}</Text>
                <Text style={s.meta}>
                  {sl.duration}s · {sl.kind === "video" ? "Video" : "Image"}
                  {layout === "split" ? " · 1×2" : ""} · {sl.enabled ? "Enabled" : "Disabled"}
                </Text>
              </View>
              <Pressable hitSlop={8} onPress={() => move(sl.id, -1)} disabled={i === 0} style={s.iconBtn}>
                <Feather name="chevron-up" size={16} color={i === 0 ? C.ink4 : C.ink2} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => move(sl.id, 1)} disabled={i === slides.length - 1} style={s.iconBtn}>
                <Feather name="chevron-down" size={16} color={i === slides.length - 1 ? C.ink4 : C.ink2} />
              </Pressable>
              <Feather name={open ? "chevron-up" : "edit-2"} size={15} color={C.amber} style={{ marginLeft: 4 }} />
            </Pressable>

            {open && (
              <View style={s.editor}>
                {sl.kind === "image" && (
                  <View style={s.editorRow}>
                    <Text style={s.editorLabel}>Layout</Text>
                    <View style={s.segment}>
                      <Pressable
                        style={[s.segmentBtn, layout === "single" && { backgroundColor: C.amber }]}
                        onPress={() => patchSlide(sl.id, { layout: "single" })}
                      >
                        <Text style={[s.segmentTxt, layout === "single" && { color: "#000000" }]}>Single</Text>
                      </Pressable>
                      <Pressable
                        style={[s.segmentBtn, layout === "split" && { backgroundColor: C.amber }]}
                        onPress={() => patchSlide(sl.id, { layout: "split" })}
                      >
                        <Text style={[s.segmentTxt, layout === "split" && { color: "#000000" }]}>1×2</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {sl.kind === "image" && (
                  <Text style={s.resHint}>{layout === "split" ? SPLIT_RES_HINT : SINGLE_RES_HINT}</Text>
                )}

                {layout === "split" && sl.kind === "image" ? (
                  <View style={s.splitRow}>
                    <View style={s.splitCol}>
                      <Pressable style={s.imgBtn} onPress={() => pickSlideMedia(sl.id)}>
                        {renderSlideMediaPreview(img, "image", s, C, { imageOnly: true, fit, split: true })}
                      </Pressable>
                      {!!img && (
                        <Pressable style={s.removeImg} onPress={() => { void setImage(sl.id, null); }}>
                          <Feather name="trash-2" size={12} color={C.bad} />
                          <Text style={[s.removeImgTxt, { color: C.bad }]}>Remove</Text>
                        </Pressable>
                      )}
                    </View>
                    <View style={s.splitCol}>
                      <Pressable style={s.imgBtn} onPress={() => pickSecondSlideMedia(sl.id)}>
                        {renderSlideMediaPreview(img2, "image", s, C, { imageOnly: true, fit, split: true })}
                      </Pressable>
                      {!!img2 && (
                        <Pressable style={s.removeImg} onPress={() => { void setImage(secondSlideImageKey(sl.id), null); }}>
                          <Feather name="trash-2" size={12} color={C.bad} />
                          <Text style={[s.removeImgTxt, { color: C.bad }]}>Remove</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ) : (
                  <>
                    <Pressable style={s.imgBtn} onPress={() => pickSlideMedia(sl.id)}>
                      {renderSlideMediaPreview(img, sl.kind, s, C, { fit })}
                    </Pressable>
                    {!!img && (
                      <Pressable style={s.removeImg} onPress={() => { void setImage(sl.id, null); }}>
                        <Feather name="trash-2" size={12} color={C.bad} />
                        <Text style={[s.removeImgTxt, { color: C.bad }]}>Remove media</Text>
                      </Pressable>
                    )}
                  </>
                )}

                {sl.kind === "image" && (
                  <View style={s.editorRow}>
                    <Text style={s.editorLabel}>Fit</Text>
                    <View style={s.segment}>
                      <Pressable
                        style={[s.segmentBtn, fit === "cover" && { backgroundColor: C.amber }]}
                        onPress={() => patchSlide(sl.id, { fit: "cover" })}
                      >
                        <Text style={[s.segmentTxt, fit === "cover" && { color: "#000000" }]}>Fill (crop)</Text>
                      </Pressable>
                      <Pressable
                        style={[s.segmentBtn, fit === "contain" && { backgroundColor: C.amber }]}
                        onPress={() => patchSlide(sl.id, { fit: "contain" })}
                      >
                        <Text style={[s.segmentTxt, fit === "contain" && { color: "#000000" }]}>Fit (show all)</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                <TextInput style={s.input} value={sl.title} onChangeText={(v) => patchSlide(sl.id, { title: v })}
                  maxLength={60}
                  placeholder="Title (e.g. Buy 1 Take 1)" placeholderTextColor={C.ink4} />
                <TextInput style={s.input} value={sl.subtitle} onChangeText={(v) => patchSlide(sl.id, { subtitle: v })}
                  maxLength={80}
                  placeholder="Subtitle (optional)" placeholderTextColor={C.ink4} />

                <View style={s.editorRow}>
                  <Text style={s.editorLabel}>Duration</Text>
                  <View style={s.stepper}>
                    <Pressable style={s.stepBtn} onPress={() => patchSlide(sl.id, { duration: Math.max(3, sl.duration - 1) })} hitSlop={8}>
                      <Feather name="minus" size={14} color={C.ink} />
                    </Pressable>
                    <Text style={s.stepVal}>{sl.duration}s</Text>
                    <Pressable style={s.stepBtn} onPress={() => patchSlide(sl.id, { duration: Math.min(20, sl.duration + 1) })} hitSlop={8}>
                      <Feather name="plus" size={14} color={C.ink} />
                    </Pressable>
                  </View>
                </View>

                <View style={s.editorRow}>
                  <Text style={s.editorLabel}>Enabled</Text>
                  <Switch value={sl.enabled} onValueChange={(v) => patchSlide(sl.id, { enabled: v })}
                    trackColor={{ false: C.line, true: `${C.amber}66` }} thumbColor={sl.enabled ? C.amber : C.ink3} />
                </View>

                <Pressable style={s.deleteBtn} onPress={() => removeSlide(sl.id)}>
                  <Feather name="trash-2" size={14} color={C.bad} />
                  <Text style={[s.deleteTxt, { color: C.bad }]}>Delete slide</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      <Pressable
        style={[s.addBtn, slides.length >= MAX_SLIDES && { opacity: 0.6 }]}
        onPress={addSlide}
        disabled={slides.length >= MAX_SLIDES}
      >
        <Feather name="plus" size={16} color={C.amber} />
        <Text style={s.addTxt}>{slides.length >= MAX_SLIDES ? `Max ${MAX_SLIDES} slides` : "Add slide"}</Text>
      </Pressable>
    </View>
  );
}

type CType = ReturnType<typeof useTheme>["C"];

function renderSlideMediaPreview(
  uri: string | undefined, kind: Slide["kind"], s: ReturnType<typeof makeStyles>, C: CType,
  opts: { imageOnly?: boolean; fit?: SlideFit; split?: boolean } = {},
) {
  if (!uri) {
    return (
      <View style={opts.split ? s.imgPlaceholderSplit : s.imgPlaceholder}>
        <Feather name="film" size={22} color={C.ink3} />
        <Text style={s.imgPlaceholderTxt}>{opts.imageOnly ? "Choose image" : "Choose image or video"}</Text>
      </View>
    );
  }
  if (kind === "video") {
    return (
      <View style={s.videoPreview}>
        <Feather name="play-circle" size={30} color="#fff" />
        <Text style={s.videoPreviewTxt}>Video selected</Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={opts.split ? s.imgPreviewSplit : s.imgPreview} resizeMode={opts.fit ?? "cover"} />;
}

const makeStyles = (C: CType) => StyleSheet.create({
  empty: { color: C.ink4, fontSize: 12, paddingVertical: 4 },
  card: { backgroundColor: C.bg, borderRadius: R.md, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10 },
  thumb: { width: 48, height: 32, borderRadius: 6, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  title: { color: C.ink, fontSize: 13, fontWeight: "600" },
  meta: { color: C.ink4, fontSize: 11, marginTop: 1 },
  iconBtn: { padding: 4 },

  editor: { borderTopWidth: 1, borderTopColor: C.lineSoft, padding: 12, gap: 10 },
  imgBtn: { borderRadius: R.md, overflow: "hidden", borderWidth: 1, borderColor: C.line, borderStyle: "dashed" },
  imgPreview: { width: "100%", aspectRatio: SINGLE_ASPECT, backgroundColor: C.surface },
  imgPreviewSplit: { width: "100%", aspectRatio: SPLIT_ASPECT, backgroundColor: C.surface },
  imgPlaceholder: { aspectRatio: SINGLE_ASPECT, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: C.surface },
  imgPlaceholderSplit: { aspectRatio: SPLIT_ASPECT, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: C.surface },
  imgPlaceholderTxt: { color: C.ink4, fontSize: 12, textAlign: "center", paddingHorizontal: 8 },
  videoPreview: { aspectRatio: SINGLE_ASPECT, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#000" },
  videoPreviewTxt: { color: "#fff", fontSize: 12, fontWeight: "600" },
  removeImg: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" },
  removeImgTxt: { fontSize: 12, fontWeight: "600" },
  resHint: { color: C.ink4, fontSize: 11, lineHeight: 15 },

  splitRow: { flexDirection: "row", gap: 8 },
  splitCol: { flex: 1, gap: 6 },

  segment: { flexDirection: "row", borderRadius: R.full, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  segmentBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.surface },
  segmentTxt: { color: C.ink2, fontSize: 12, fontWeight: "600" },

  input: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14 },
  editorRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editorLabel: { color: C.ink2, fontSize: 13 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surface, borderRadius: R.full, borderWidth: 1, borderColor: C.line, paddingHorizontal: 6, paddingVertical: 4 },
  stepBtn: { width: 28, height: 28, borderRadius: R.full, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  stepVal: { color: C.ink, fontSize: 14, fontWeight: "700", minWidth: 34, textAlign: "center" },

  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  deleteTxt: { fontSize: 13, fontWeight: "600" },

  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: R.md, borderWidth: 1, borderColor: `${C.amber}66`, borderStyle: "dashed", backgroundColor: `${C.amber}10` },
  addTxt: { color: C.amber, fontSize: 13, fontWeight: "700" },
});
