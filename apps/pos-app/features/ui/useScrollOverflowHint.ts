/**
 * useScrollOverflowHint — "more to scroll" hint math for a ScrollView with no
 * visible scrollbar. True once the scrollable content extends more than
 * `threshold` px past the current viewport+offset.
 *
 * Extracted from FormSheetModal.tsx's inline evalScrollHint, which duplicated
 * the same calculation products.tsx already had twice (its status-tabs row
 * and category-filter row, horizontal) and transactions.tsx's DetailPanel had
 * a third time (vertical). Pass axis: "horizontal" for a horizontally
 * scrolling row; defaults to vertical.
 *
 * Usage:
 *   const hint = useScrollOverflowHint();
 *   <ScrollView onLayout={hint.onLayout} onContentSizeChange={hint.onContentSizeChange} onScroll={hint.onScroll} scrollEventThrottle={32}>
 *   {hint.showHint && <ScrollHintPill />}
 */
import { useCallback, useRef, useState } from "react";
import type { LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from "react-native";

export function useScrollOverflowHint(threshold = 24, axis: "vertical" | "horizontal" = "vertical") {
  const [showHint, setShowHint] = useState(false);
  const viewportSize = useRef(0);

  const evalHint = useCallback((contentSize: number, viewport: number, offset: number) => {
    setShowHint(contentSize - viewport - offset > threshold);
  }, [threshold]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    viewportSize.current = axis === "horizontal" ? e.nativeEvent.layout.width : e.nativeEvent.layout.height;
  }, [axis]);

  const onContentSizeChange = useCallback((w: number, h: number) => {
    evalHint(axis === "horizontal" ? w : h, viewportSize.current, 0);
  }, [axis, evalHint]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (axis === "horizontal") evalHint(contentSize.width, layoutMeasurement.width, contentOffset.x);
    else evalHint(contentSize.height, layoutMeasurement.height, contentOffset.y);
  }, [axis, evalHint]);

  return { showHint, onLayout, onContentSizeChange, onScroll };
}
