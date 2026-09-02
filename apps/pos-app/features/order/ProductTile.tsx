/**
 * Product grid tile — image/initial, name, price, stock badge.
 *
 * Extracted from app/pos/order.tsx. Memoised: the product grid re-renders on
 * every cart change, and a tile only depends on its own props.
 */
import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import React from "react";
import { Feather } from "@expo/vector-icons";
import { peso } from "./format";
import type { Product } from "./types";
import type { makeStyles } from "./orderScreenStyles";

export type ProductTileStyles = ReturnType<typeof makeStyles>;

/** "1:1" reset target — same on phone and tablet, since the whole point of a
 *  fixed card size is that it doesn't depend on screen size at all. Only the
 *  zoom buttons change it. */
export const BASE_CARD_WIDTH = 150;
export const MIN_CARD_WIDTH = 110;
export const MAX_CARD_WIDTH = 220;
export const CARD_WIDTH_STEP = 20;
// height = width * this — keeps every card the same shape at any zoom level,
// not just the same width, so zooming in/out doesn't stretch/squash them.
const CARD_ASPECT_RATIO = 1.35;
const CARD_IMG_RATIO = 0.6; // fraction of total card height given to the image block

export const ProductTile = React.memo(function ProductTile({
  product: p, qtyInCart, s, cardWidth, onPress, onDecrement, onLongPress,
}: {
  product: Product;
  qtyInCart: number;
  s: ProductTileStyles;
  /** Fixed physical width for this card, in px — see BASE_CARD_WIDTH above. */
  cardWidth: number;
  onPress: (p: Product) => void;
  onDecrement: (p: Product) => void;
  /** Long-press opens the quick "mark unavailable" confirm — see order.tsx. */
  onLongPress: (p: Product) => void;
}) {
  const inCart = qtyInCart > 0;
  const isUnavailable = p.active === false;
  const isOutOfStock = p.stock_status === "out_of_stock";
  const isLowStock   = p.stock_status === "low_stock";
  const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO);
  const imgHeight  = Math.round(cardHeight * CARD_IMG_RATIO);
  const bodyHeight = cardHeight - imgHeight;
  return (
    <Pressable
      style={({ pressed }) => [
        s.productTile, { width: cardWidth },
        inCart && s.productTileInCart, pressed && s.productTilePressed,
        (isOutOfStock || isUnavailable) && s.productTileOutOfStock,
      ]}
      onPress={() => onPress(p)}
      onLongPress={() => onLongPress(p)}
    >
      <View style={[s.productImg, { height: imgHeight }]}>
        {p.image_url
          ? (
            <Image
              source={{ uri: p.image_url }}
              style={{ width: "100%", height: "100%", borderRadius: 8 }}
              contentFit="cover"
              cachePolicy="disk"
              recyclingKey={p.id}
              transition={100}
            />
          )
          : <Text style={s.productImgLabel} numberOfLines={1}>{p.category?.toUpperCase() ?? "ITEM"}</Text>
        }
        {p.sku ? (
          <View style={s.productImgSku}>
            <Text style={s.productImgSkuText}>{p.sku}</Text>
          </View>
        ) : null}
        {inCart && (
          <View style={s.productImgBadge}>
            <Text style={s.productImgBadgeText}>×{qtyInCart}</Text>
          </View>
        )}
        {(isUnavailable || isOutOfStock) && (
          <View style={s.productOutOfStockOverlay}>
            <Text style={s.productOutOfStockText}>{isUnavailable ? "Unavailable" : "Out of Stock"}</Text>
          </View>
        )}
        {p.is_pinned && (
          <View style={{ position: "absolute", bottom: 4, left: 4, backgroundColor: "#f59e0b", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
            <Text style={{ color: "#fff", fontSize: 8, fontWeight: "700" }}>★</Text>
          </View>
        )}
      </View>
      <View style={[s.productBody, { height: bodyHeight }]}>
        <Text style={s.productName} numberOfLines={2}>{p.name}</Text>
        <Text style={s.productPrice}>{peso(p.price)}</Text>
        {inCart && (
          <View style={s.productQtyStepper}>
            <Pressable style={s.productQtyBtn} hitSlop={8} onPress={() => onDecrement(p)}>
              <Feather name="minus" size={13} color={s.productQtyBtnIcon.color} />
            </Pressable>
            <Text style={s.productQtyNum}>{qtyInCart}</Text>
            <Pressable style={s.productQtyBtn} hitSlop={8} onPress={() => onPress(p)}>
              <Feather name="plus" size={13} color={s.productQtyBtnIcon.color} />
            </Pressable>
          </View>
        )}
        {isLowStock && (
          <Text style={s.productLowStock}>
            Low stock{p.available_quantity != null ? ` · ${p.available_quantity} left` : ""}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

/* ── Main ── */
