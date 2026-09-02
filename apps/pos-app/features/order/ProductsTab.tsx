/**
 * Products tab — search, category chips, out-of-stock toggle and the paginated
 * product grid.
 *
 * Extracted from app/pos/order.tsx. Purely presentational: the screen owns the
 * product list, filtering and pagination and passes results in.
 */
import { View, Text, Pressable, ScrollView, TextInput, FlatList, ActivityIndicator } from "react-native";
import { useState } from "react";
import type { MutableRefObject, ReactElement } from "react";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import type { Product } from "./types";
import type { OrderScreenStyles } from "./orderScreenStyles";
import { BASE_CARD_WIDTH, MIN_CARD_WIDTH, MAX_CARD_WIDTH, CARD_WIDTH_STEP } from "./ProductTile";

/** Grid never collapses below two columns — one-per-row wastes tablet width. */
const MIN_GRID_COLS = 2;
// Rough per-tile horizontal space eaten by productTile's own margin (4px each
// side) — just enough to keep the column count from slightly overshooting
// what actually fits at the fixed card width.
const TILE_GUTTER = 8;

interface Props {
  readonly search: string;            readonly setSearch: (v: string) => void;
  readonly activeCat: string;         readonly setActiveCat: (v: string) => void;
  readonly categories: string[];
  readonly categoryCounts: Map<string, number>;
  readonly filtered: Product[];
  readonly products: Product[];
  readonly hideOos: boolean;          readonly setHideOos: (v: boolean) => void;
  readonly oosToggleW: number;        readonly setOosToggleW: (v: number) => void;
  readonly cardWidthEff: number;
  readonly setCardWidth: (v: number | null) => void;
  readonly loading: boolean;
  readonly showCatScrollHint: boolean;
  readonly catScrollViewportW: MutableRefObject<number>;
  readonly evalCatScrollHint: (contentW: number, viewportW: number, offsetX: number) => void;
  readonly renderProductItem: ({ item }: { item: Product }) => ReactElement | null;
  readonly s: OrderScreenStyles;
  readonly C: ReturnType<typeof useTheme>["C"];
}

export function ProductsTab(p: Props) {
  const {
    search, setSearch, activeCat, setActiveCat, categories, categoryCounts,
    filtered, products, hideOos, setHideOos, oosToggleW, setOosToggleW,
    cardWidthEff, setCardWidth, loading,
    showCatScrollHint, catScrollViewportW, evalCatScrollHint,
    renderProductItem,
    s, C,
  } = p;
  // Measured once the grid's container has laid out — column count is
  // derived from this, not a manually-stepped number, so the card itself
  // always renders at cardWidthEff regardless of how many columns that
  // happens to fit.
  const [containerWidth, setContainerWidth] = useState(0);
  const numColumns = containerWidth > 0
    ? Math.max(MIN_GRID_COLS, Math.floor(containerWidth / (cardWidthEff + TILE_GUTTER)))
    : MIN_GRID_COLS;
  return (
    <>
              {/* Search */}
              <View style={s.searchWrap}>
                <Text style={s.searchIcon}>⌕</Text>
                <TextInput
                  style={s.searchInput}
                  placeholder="Search products…"
                  placeholderTextColor={C.ink4}
                  value={search}
                  onChangeText={setSearch}
                />
                {search ? (
                  <Pressable onPress={() => setSearch("")}>
                    <Text style={{ color: C.ink3, fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
                  </Pressable>
                ) : null}
                <View style={s.zoomGroup}>
                  <Pressable
                    style={s.zoomBtn} hitSlop={6}
                    disabled={cardWidthEff >= MAX_CARD_WIDTH}
                    onPress={() => setCardWidth(Math.min(MAX_CARD_WIDTH, cardWidthEff + CARD_WIDTH_STEP))}
                  >
                    <Feather name="zoom-in" size={15} color={cardWidthEff >= MAX_CARD_WIDTH ? C.ink4 : C.ink3} />
                  </Pressable>
                  <Pressable
                    style={s.zoomBtn} hitSlop={6}
                    disabled={cardWidthEff <= MIN_CARD_WIDTH}
                    onPress={() => setCardWidth(Math.max(MIN_CARD_WIDTH, cardWidthEff - CARD_WIDTH_STEP))}
                  >
                    <Feather name="zoom-out" size={15} color={cardWidthEff <= MIN_CARD_WIDTH ? C.ink4 : C.ink3} />
                  </Pressable>
                  <Pressable
                    style={s.zoomBtn} hitSlop={6}
                    disabled={cardWidthEff === BASE_CARD_WIDTH}
                    onPress={() => setCardWidth(null)}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "700", color: cardWidthEff === BASE_CARD_WIDTH ? C.ink4 : C.ink3 }}>1:1</Text>
                  </Pressable>
                </View>
              </View>

              {/* Categories + stock filter */}
              <View style={s.catBar}>
                <ScrollView
                  horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={s.catRow}
                  onLayout={(e) => { catScrollViewportW.current = e.nativeEvent.layout.width; }}
                  onContentSizeChange={(w) => evalCatScrollHint(w, catScrollViewportW.current, 0)}
                  onScroll={(e) => {
                    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                    evalCatScrollHint(contentSize.width, layoutMeasurement.width, contentOffset.x);
                  }}
                  scrollEventThrottle={32}
                >
                  {categories.map(cat => (
                    <Pressable
                      key={cat}
                      style={[s.chip, activeCat === cat && s.chipActive]}
                      onPress={() => setActiveCat(cat)}
                    >
                      <Text style={[s.chipText, activeCat === cat && s.chipTextActive]}>
                        {cat} · {categoryCounts.get(cat) ?? 0}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {showCatScrollHint && (
                  <View style={[s.catScrollHint, { right: oosToggleW + 4 }]} pointerEvents="none">
                    <View style={s.catScrollHintPill}>
                      <Feather name="chevrons-right" size={13} color={C.ink3}/>
                    </View>
                  </View>
                )}
                <Pressable
                  style={s.oosToggle} onPress={() => setHideOos(!hideOos)}
                  onLayout={(e) => { setOosToggleW(e.nativeEvent.layout.width); }}
                >
                  <View style={[s.oosCheck, hideOos && {backgroundColor:C.good,borderColor:C.good}]}>
                    {hideOos && <Feather name="check" size={9} color="#fff"/>}
                  </View>
                  <Text style={s.oosTxt}>Hide OOS</Text>
                </Pressable>
              </View>

              {/* Product grid */}
              {loading ? (
                <View style={s.loadingWrap}>
                  <ActivityIndicator color={C.amber} />
                  <Text style={s.loadingText}>Loading products…</Text>
                </View>
              ) : (
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item.id}
                  numColumns={numColumns}
                  key={`grid-${numColumns}`}
                  style={{ flex: 1 }}
                  contentContainerStyle={s.productGrid}
                  onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
                  renderItem={renderProductItem}
                  ListEmptyComponent={
                    <View style={s.emptyWrap}><Text style={s.emptyText}>No products found</Text></View>
                  }
                />
              )}
    </>
  );
}
