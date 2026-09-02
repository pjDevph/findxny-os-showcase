/**
 * Reusable customer search/select control.
 *
 * Debounced type-ahead over `customers-search` (edge function — enforces
 * auth/role server-side and escapes the search term). Renders as a search input
 * with a results dropdown until a customer is picked, then collapses to a
 * dismissible pill.
 *
 * Extracted from app/pos/order.tsx so any screen needing customer attach
 * (orders, bookings, receipts) can reuse it. Behaviour is unchanged from the
 * original inline version.
 *
 * Also supports a free-text fallback: if the typed name doesn't match any
 * saved customer, "Use ... as guest name" attaches it as a plain display
 * name (receipts/tickets) without creating or linking a customer record —
 * deliberately NOT wired to loyalty, since there's no customer id behind it.
 */
import { View, Text, Pressable, TextInput, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { memo, useMemo, useState, useRef } from "react";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
type C = ReturnType<typeof useTheme>["C"];

export interface Customer {
  id: string; name: string; phone: string | null; email: string | null; notes?: string | null;
}

interface Props {
  readonly workspaceId: string | null;
  readonly selected: Customer | null;
  readonly onSelect: (c: Customer | null) => void;
  /** Free-typed walk-in name in effect when no saved customer is selected. */
  readonly guestName?: string;
  /** Fires with "" to clear. Omitting this prop hides the free-text fallback entirely. */
  readonly onGuestNameChange?: (name: string) => void;
}

function CustomerSelectorBase({ workspaceId, selected, onSelect, guestName, onGuestNameChange }: Props) {
  const { C } = useTheme();
  const cs = useMemo(() => makeCsStyles(C), [C]);
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const searchTimer           = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function search(text: string) {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    // customers-search requires a 2-char minimum; below that there's nothing
    // useful to match on anyway.
    if (text.trim().length < 2 || !workspaceId) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await invokeFn<{ customers: Customer[] }>("customers-search", {
          workspace_id: workspaceId,
          query: text.trim(),
          limit: 8,
        });
        setResults(data?.customers ?? []);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function pick(c: Customer) {
    onSelect(c);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function clear() {
    onSelect(null);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function useAsGuestName() {
    const name = query.trim();
    if (!name || !onGuestNameChange) return;
    onGuestNameChange(name);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function clearGuestName() {
    onGuestNameChange?.("");
  }

  if (selected) {
    return (
      <Pressable style={cs.selectedPill} onPress={clear}>
        <Text style={cs.selectedName} numberOfLines={1}>{selected.name}</Text>
        <Feather name="x" size={13} color={C.amber} style={cs.selectedClear} />
      </Pressable>
    );
  }

  if (guestName) {
    return (
      <Pressable style={cs.selectedPill} onPress={clearGuestName}>
        <Text style={cs.selectedName} numberOfLines={1}>{guestName}</Text>
        <Feather name="x" size={13} color={C.amber} style={cs.selectedClear} />
      </Pressable>
    );
  }

  const showGuestOption = !!onGuestNameChange && query.trim().length >= 1;

  return (
    <View style={cs.wrap}>
      <View style={cs.inputWrap}>
        <Feather name="search" size={13} color={C.ink3} />
        <TextInput
          style={cs.input}
          placeholder="Search customer"
          placeholderTextColor={C.ink3}
          value={query}
          onChangeText={(t) => { search(t); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {loading && <ActivityIndicator size="small" color={C.amber} />}
      </View>
      {open && (results.length > 0 || showGuestOption) && (
        <View style={cs.dropdown}>
          {results.map(c => (
            <Pressable key={c.id} style={cs.resultRow} onPress={() => pick(c)}>
              <Text style={cs.resultName}>{c.name}</Text>
              {c.phone ? <Text style={cs.resultSub}>{c.phone}</Text> : null}
              {c.notes ? <Text style={cs.resultNote} numberOfLines={1}>{c.notes}</Text> : null}
            </Pressable>
          ))}
          {showGuestOption && (
            <Pressable style={cs.resultRow} onPress={useAsGuestName}>
              <Text style={cs.guestOptionText}>{`Use "${query.trim()}" as guest name`}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

/** Memoised: the parent screen re-renders on every cart/keystroke change, and
 *  this subtree only depends on its three props. */
export const CustomerSelector = memo(CustomerSelectorBase);

const makeCsStyles = (C: C) => StyleSheet.create({
  wrap:         { flex: 1, position: "relative" },
  // No flex:1 here — this sits inside `wrap`'s default column layout, so it
  // already stretches to wrap's width and sizes its own height from content
  // (the TextInput's intrinsic line height). Giving it flex:1 too creates a
  // circular height dependency when this is the row's only child (Takeout/
  // Room Service, with no Table# sibling to anchor the row's height) — Yoga
  // resolves that to ~0 height, so the icon/placeholder render but are
  // squeezed invisibly thin.
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  input: { flex: 1, padding: 0, color: C.ink, fontSize: 13 },
  dropdown: {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, elevation: 20,
    backgroundColor: C.bg2, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    marginTop: 2, overflow: "hidden",
  },
  resultRow: {
    paddingHorizontal: 10, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: C.lineSoft,
  },
  resultName: { color: C.ink, fontSize: 13, fontWeight: "500" },
  resultSub:  { color: C.ink4, fontSize: 11, fontFamily: MONO, marginTop: 1 },
  resultNote: { color: C.ink4, fontSize: 11 },
  guestOptionText: { color: C.amber, fontSize: 13, fontWeight: "500" },
  selectedPill: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: C.amberBg, borderRadius: R.md, borderWidth: 1, borderColor: `${C.amber}60`,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  selectedName: { color: C.amber, fontSize: 13, fontWeight: "600", flex: 1 },
  selectedClear:{ marginLeft: 6 },
});
