/**
 * useAnchoredDropdown — measure-and-position state for a dropdown menu
 * anchored to a trigger button.
 *
 * Pairs with AnchoredDropdown.tsx. Replaces printers.tsx's two near-identical
 * category-picker/printer-picker dropdown implementations and reports.tsx's
 * filter dropdown, each of which measured its own trigger ref and tracked its
 * own {top,left} state independently.
 *
 * Usage:
 *   const dd = useAnchoredDropdown();
 *   <View ref={dd.anchorRef}><Pressable onPress={dd.open}>...</Pressable></View>
 *   <AnchoredDropdown visible={dd.visible} position={dd.position} onClose={dd.close}>...</AnchoredDropdown>
 */
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";

export interface AnchoredPosition {
  top: number;
  left: number;
  width: number;
}

export function useAnchoredDropdown() {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<AnchoredPosition>({ top: 0, left: 0, width: 0 });
  const anchorRef = useRef<View>(null);

  const open = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setPosition({ top: y + height + 4, left: x, width });
      setVisible(true);
    });
  }, []);

  const close = useCallback(() => setVisible(false), []);

  return { anchorRef, visible, position, open, close };
}
