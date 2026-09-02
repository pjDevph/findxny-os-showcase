import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  View, Text, Pressable, Modal, ActivityIndicator,
  StyleSheet, Platform, ScrollView, useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import { useBreakpoint } from "../../hooks/useBreakpoint";

const MONO   = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const WDAYS  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CELL_H = 56;
const CIRCLE = 44;
const SHEET_MAX_NARROW = 640;
const SHEET_MAX_WIDE   = 980;
const SUMMARY_COL_W    = 300;

function calcCellW(calendarAreaWidth: number) {
  return Math.floor((calendarAreaWidth - 32) / 7);
}

export interface RoomCalendarRoom {
  id: string;
  name: string;
  hourly_rate: number;
  nightly_rate?: number | null;
  capacity?: number | null;
}

interface RoomCalendarBookingsResult {
  "room-calendar-bookings": Array<{ start_time: string; end_time: string }>;
}

interface Props {
  visible:     boolean;
  room:        RoomCalendarRoom | null;
  workspaceId: string;
  onConfirm:   (checkIn: string, checkOut: string) => void;
  onClose:     () => void;
  mode?:       "range" | "single";
  badgeLabel?: string;
  /**
   * Bump this (e.g. a counter incremented after any booking mutation —
   * confirm/cancel/check-in/etc.) to invalidate the entire month cache.
   * Covers mutations that happen outside this component (e.g. cancelling a
   * booking from a list elsewhere on the screen) which wouldn't otherwise
   * be seen by the calendar's own cache. Optional — omitting it just means
   * the cache only self-invalidates via this component's own onConfirm.
   */
  refreshKey?: number | string;
}

type DaySt = "past" | "occupied" | "available" | "departure" | "today" | "start" | "end" | "range";

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function som(d: Date)  { return new Date(d.getFullYear(), d.getMonth(), 1); }
function eom(d: Date)  { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function shiftM(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

function fmtShort(d: string) {
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}
function fmtFull(d: string) {
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

type C = ReturnType<typeof useTheme>["C"];

function isOccupiedDate(d: string, booked: Array<{ start: string; end: string }>) {
  return booked.some((r) => r.start <= d && d < r.end);
}

function isRangeClean(
  a: string,
  b: string,
  booked: Array<{ start: string; end: string }>,
) {
  let d = new Date(a);
  const e = new Date(b);
  while (d < e) {
    if (isOccupiedDate(ymd(d), booked)) return false;
    d = addDays(d, 1);
  }
  return true;
}

interface TapDateOptions {
  d: string;
  todayStr: string;
  booked: Array<{ start: string; end: string }>;
  mode: "range" | "single";
  selStart: string | null;
  selEnd: string | null;
  setSelStart: (v: string | null) => void;
  setSelEnd: (v: string | null) => void;
  setRangeConflict: (v: boolean) => void;
}

function tapDate({ d, todayStr, booked, mode, selStart, selEnd, setSelStart, setSelEnd, setRangeConflict }: TapDateOptions) {
  if (d < todayStr || isOccupiedDate(d, booked)) return;
  setRangeConflict(false);
  if (mode === "single") { setSelStart(d); setSelEnd(d); return; }
  if (!selStart || selEnd) { setSelStart(d); setSelEnd(null); return; }
  if (d <= selStart)       { setSelStart(d); setSelEnd(null); return; }
  if (isRangeClean(selStart, d, booked)) {
    setSelEnd(d);
  } else {
    setRangeConflict(true);
  }
}

function calcDayState(
  d: string,
  todayStr: string,
  selStart: string | null,
  selEnd: string | null,
  booked: Array<{ start: string; end: string }>,
): DaySt {
  if (d < todayStr)                                      return "past";
  if (selStart && d === selStart)                        return "start";
  if (selEnd   && d === selEnd)                          return "end";
  if (selStart && selEnd && d > selStart && d < selEnd)  return "range";
  if (isOccupiedDate(d, booked))                         return "occupied";
  if (booked.some((r) => r.end === d))                   return "departure";
  if (d === todayStr)                                    return "today";
  return "available";
}

function calcCtaLabel(
  mode: "range" | "single",
  selStart: string | null,
  selEnd: string | null,
  nights: number,
): string {
  if (mode === "single") {
    return selStart ? `Confirm  ${fmtShort(selStart)}` : "Select a date";
  }
  if (!selStart) return "Select check-in date";
  if (!selEnd)   return "Choose check-out date";
  return `Confirm Dates  ·  ${nights} night${nights !== 1 ? "s" : ""}`;
}

function calcHintStep(
  mode: "range" | "single",
  selStart: string | null,
  selEnd: string | null,
): string {
  if (mode === "single") return selStart ? "Date selected" : "Select date";
  if (!selStart) return "Step 1 of 2";
  if (!selEnd)   return "Step 2 of 2";
  return "Dates selected ✓";
}

function calcHintTxt(
  mode: "range" | "single",
  selStart: string | null,
  selEnd: string | null,
  nights: number,
): string {
  if (mode === "single") {
    return selStart ? fmtFull(selStart) : "Tap a date to book";
  }
  if (!selStart) return "Tap a date to set check-in";
  if (!selEnd)   return `Check-in: ${fmtShort(selStart)}  ·  Now tap check-out`;
  return `${fmtShort(selStart)}  →  ${fmtShort(selEnd)}  ·  ${nights} night${nights !== 1 ? "s" : ""}`;
}

function renderPricePreview(
  nights: number,
  nightRate: number,
  noRate: boolean,
  s: ReturnType<typeof makeStyles>,
  C: C,
) {
  if (nights <= 0) return null;
  const totalAmt = nightRate * nights;
  if (noRate) {
    return (
      <View style={s.noPriceBox}>
        <Feather name="alert-circle" size={13} color={C.warn} />
        <Text style={s.noPriceTxt}>Room rate not configured — price will be ₱0.00</Text>
      </View>
    );
  }
  return (
    <View style={s.priceBox}>
      <View style={s.priceRow}>
        <Text style={s.priceLbl} numberOfLines={1}>
          {nights} night{nights !== 1 ? "s" : ""} × {peso(nightRate)}
        </Text>
        <Text style={s.priceVal}>{peso(totalAmt)}</Text>
      </View>
      <View style={s.priceDivider} />
      <View style={s.priceRow}>
        <Text style={s.priceTotalLbl}>TOTAL</Text>
        <Text style={s.priceTotalVal}>{peso(totalAmt)}</Text>
      </View>
    </View>
  );
}

function renderSummaryPanel(
  selStart: string | null,
  selEnd: string | null,
  nights: number,
  rangeConflict: boolean,
  room: RoomCalendarRoom,
  s: ReturnType<typeof makeStyles>,
  C: C,
) {
  // The real nightly rate always wins when configured — this is just a
  // date-picking preview (exact check-in/out time isn't set yet), so
  // falling back to hourly×24 is only an estimate for rooms that were
  // never given a night rate.
  const nightRate = room.nightly_rate ?? room.hourly_rate * 24;
  const noRate     = !room.nightly_rate && room.hourly_rate === 0;
  return (
    <View style={s.summaryPanel}>
      <View style={s.summaryRow}>
        <View style={s.summaryItem}>
          <Text style={s.summaryItemLabel}>CHECK-IN</Text>
          <Text style={[s.summaryItemValue, !selStart && s.summaryPlaceholder]}>
            {selStart ? fmtFull(selStart) : "Not selected"}
          </Text>
        </View>
        <View style={s.summaryArrowWrap}>
          <Text style={s.summaryArrow}>→</Text>
        </View>
        <View style={s.summaryItem}>
          <Text style={s.summaryItemLabel}>CHECK-OUT</Text>
          <Text style={[s.summaryItemValue, !selEnd && s.summaryPlaceholder]}>
            {selEnd ? fmtFull(selEnd) : "Not selected"}
          </Text>
        </View>
        {nights > 0 && (
          <View style={s.summaryNights}>
            <Text style={s.summaryNightsNum}>{nights}</Text>
            <Text style={s.summaryNightsLabel}>night{nights !== 1 ? "s" : ""}</Text>
          </View>
        )}
      </View>
      {renderPricePreview(nights, nightRate, noRate, s, C)}
      {rangeConflict && (
        <View style={s.conflictBox}>
          <Feather name="alert-triangle" size={13} color={C.bad} />
          <Text style={s.conflictTxt}>
            Range includes an occupied date. Choose a different check-out date.
          </Text>
        </View>
      )}
    </View>
  );
}

export function RoomCalendar({ visible, room, workspaceId, onConfirm, onClose, mode = "range", badgeLabel, refreshKey }: Props) {
  const { C } = useTheme();
  const { width: winWidth } = useWindowDimensions();
  // Two-column layout (calendar + a docked, always-visible selection/price
  // panel) on tablet+ so choosing dates never needs a scroll to see the
  // total — on phone the summary panel stays inline, below the grid.
  const { isTablet } = useBreakpoint();
  const wide = isTablet && mode === "range";
  const sheetWidth = Math.min(winWidth - 32, wide ? SHEET_MAX_WIDE : SHEET_MAX_NARROW);
  const calendarAreaWidth = wide ? sheetWidth - SUMMARY_COL_W : sheetWidth;
  const cellW = calcCellW(calendarAreaWidth);
  const s = useMemo(() => makeStyles(C, cellW, sheetWidth), [C, cellW, sheetWidth]);

  const todayStr = useMemo(() => ymd(new Date()), []);
  const [month,         setMonth]         = useState(() => som(new Date()));
  const [booked,        setBooked]        = useState<Array<{ start: string; end: string }>>([]);
  const [loading,       setLoading]       = useState(false);
  const [selStart,      setSelStart]      = useState<string | null>(null);
  const [selEnd,        setSelEnd]        = useState<string | null>(null);
  const [rangeConflict, setRangeConflict] = useState(false);

  // In-memory cache of fetched months, keyed by `${resource_id}:${start_of_month}`.
  // RoomCalendar is mounted persistently by its parent screen (visibility is
  // toggled via the `visible` prop, not by mount/unmount), so this cache
  // survives across modal opens/closes for the lifetime of the parent screen —
  // flipping back to an already-viewed month never re-fetches.
  const bookedCacheRef = useRef<Map<string, Array<{ start: string; end: string }>>>(new Map());

  const invalidateRoomCache = useCallback((resourceId: string) => {
    for (const key of bookedCacheRef.current.keys()) {
      if (key.startsWith(`${resourceId}:`)) bookedCacheRef.current.delete(key);
    }
  }, []);

  // External signal (e.g. a booking cancelled/checked-in from a list elsewhere
  // on the parent screen) — drop the whole cache so the next month view re-fetches.
  const isFirstRefreshKey = useRef(true);
  useEffect(() => {
    if (isFirstRefreshKey.current) { isFirstRefreshKey.current = false; return; }
    bookedCacheRef.current.clear();
  }, [refreshKey]);

  useEffect(() => {
    if (!visible) return;
    setSelStart(null);
    setSelEnd(null);
    setRangeConflict(false);
    setMonth(som(new Date()));
  }, [room?.id, visible]);

  useEffect(() => {
    if (!room || !workspaceId || !visible) return;
    const monthKey = ymd(som(month));
    const cacheKey = `${room.id}:${monthKey}`;
    const cached = bookedCacheRef.current.get(cacheKey);
    if (cached) {
      setBooked(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    invokeFn<RoomCalendarBookingsResult>("pos-data", {
      workspace_id: workspaceId,
      resource: "room-calendar-bookings",
      params: {
        resource_id: room.id,
        start_of_month: monthKey,
      },
    }).then(({ data }) => {
      if (cancelled) return;
      const rows = data?.["room-calendar-bookings"] ?? [];
      const mapped = rows.map((b) => ({
        start: b.start_time.slice(0, 10),
        end:   b.end_time.slice(0, 10),
      }));
      bookedCacheRef.current.set(cacheKey, mapped);
      setBooked(mapped);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [room, workspaceId, month, visible]);

  const rows = useMemo(() => {
    const first = som(month);
    const last  = eom(month);
    const flat: Array<{ date: string; n: number } | null> = [];
    for (let i = 0; i < first.getDay(); i++) flat.push(null);
    let d = new Date(first);
    while (d <= last) { flat.push({ date: ymd(d), n: d.getDate() }); d = addDays(d, 1); }
    while (flat.length % 7) flat.push(null);
    const result: Array<typeof flat> = [];
    for (let i = 0; i < flat.length; i += 7) result.push(flat.slice(i, i + 7));
    return result;
  }, [month]);

  const nights = selStart && selEnd
    ? Math.round((new Date(selEnd).getTime() - new Date(selStart).getTime()) / 86_400_000)
    : 0;

  // Quick "how open is this month" reference for the sidebar — counts only
  // from today forward, since past days were never bookable anyway.
  const monthStats = useMemo(() => {
    const last = eom(month);
    let available = 0, occupied = 0;
    let d = som(month);
    while (d <= last) {
      const ds = ymd(d);
      if (ds >= todayStr) {
        if (isOccupiedDate(ds, booked)) occupied++; else available++;
      }
      d = addDays(d, 1);
    }
    return { available, occupied };
  }, [month, booked, todayStr]);

  const canGoBack  = month > som(new Date());
  const canConfirm = !!selStart && (mode === "single" || !!selEnd);
  const ctaLabel   = calcCtaLabel(mode, selStart, selEnd, nights);
  const hintStep   = calcHintStep(mode, selStart, selEnd);
  const hintTxt    = calcHintTxt(mode, selStart, selEnd, nights);

  function renderCell(cell: { date: string; n: number } | null, key: string) {
    if (!cell) return <View key={key} style={s.cell} />;
    const st       = calcDayState(cell.date, todayStr, selStart, selEnd, booked);
    const disabled = st === "past" || st === "occupied";
    const isStart  = st === "start";
    const isEnd    = st === "end";
    const isRange  = st === "range";
    const isOcc    = st === "occupied";
    const isToday  = st === "today";
    const isDep    = st === "departure";
    const hasRange = !!(selStart && selEnd);

    return (
      <Pressable
        key={key}
        style={[s.cell, isRange && s.cellRange, isOcc && s.cellOccupied]}
        onPress={() => tapDate({ d: cell.date, todayStr, booked, mode, selStart, selEnd, setSelStart, setSelEnd, setRangeConflict })}
        disabled={disabled}
      >
        {/* Half-bg range connectors */}
        {isStart && hasRange && (
          <View style={[s.halfBg, { left: cellW / 2, right: 0 }]} />
        )}
        {isEnd && (
          <View style={[s.halfBg, { left: 0, width: cellW / 2 }]} />
        )}

        {/* Occupied days fill the whole square cell (matches the app's
            square/no-radius theme) instead of a circle floating inside a
            lighter tint — one solid shape, not two overlapping ones. */}
        {isOcc ? (
          <>
            <Text style={s.tOcc}>{cell.n}</Text>
            <Text style={s.tOccLabel}>Booked</Text>
          </>
        ) : (
          <View style={[s.inner, (isStart || isEnd) && s.innerSel]}>
            <Text style={[
              s.dayN,
              (isStart || isEnd) && s.tSel,
              isRange  && s.tRange,
              isToday  && s.tToday,
              isDep    && s.tDep,
              st === "past" && s.tPast,
            ]}>
              {cell.n}
            </Text>
          </View>
        )}

        {isToday && !isStart && !isEnd && <View style={s.todayDot} />}
      </Pressable>
    );
  }

  if (!room) return null;

  // Wide layout docks this in the sidebar (which has the room for it);
  // phone keeps it inline below the grid, in the single scrolling column.
  const legendNode = (
    <View style={[s.legend, wide && s.legendInBar]}>
      <View style={s.lgItem}>
        <View style={[s.lgDot, { backgroundColor: C.ink3 }]} />
        <Text style={s.lgTxt}>Available</Text>
      </View>
      <View style={s.lgItem}>
        <View style={[s.lgDot, { backgroundColor: C.bad }]} />
        <Text style={s.lgTxt}>Occupied</Text>
      </View>
      <View style={s.lgItem}>
        <View style={[s.lgDot, { backgroundColor: C.good }]} />
        <Text style={s.lgTxt}>Checkout only</Text>
      </View>
      <View style={s.lgItem}>
        <View style={[s.lgDot, { backgroundColor: C.amber }]} />
        <Text style={s.lgTxt}>Selected</Text>
      </View>
    </View>
  );

  const calendarBody = (
    <>
      {/* Month navigation */}
      <View style={s.monthRow}>
        <Pressable
          onPress={() => canGoBack && setMonth((m) => shiftM(m, -1))}
          disabled={!canGoBack} hitSlop={12} style={s.navBtn}>
          <Text style={[s.navArrow, !canGoBack && s.navDim]}>‹</Text>
        </Pressable>
        <Text style={s.monthLabel}>{MONTHS[month.getMonth()]} {month.getFullYear()}</Text>
        <Pressable onPress={() => setMonth((m) => shiftM(m, 1))} hitSlop={12} style={s.navBtn}>
          <Text style={s.navArrow}>›</Text>
        </Pressable>
      </View>

      {/* Day-of-week headers */}
      <View style={s.weekRow}>
        {WDAYS.map((d) => <Text key={d} style={s.weekDay}>{d}</Text>)}
      </View>

      {/* Calendar grid */}
      {loading ? (
        <View style={s.loadBox}><ActivityIndicator color={C.amber} /></View>
      ) : (
        <View style={s.grid}>
          {rows.map((row, ri) => (
            <View key={ri} style={s.gridRow}>
              {row.map((cell, ci) => renderCell(cell, `${ri}-${ci}`))}
            </View>
          ))}
        </View>
      )}

      {!wide && legendNode}

      {/* Date summary panel — inline, phone only (tablet docks it in the
          side column instead so it's visible without scrolling) */}
      {!wide && mode === "range" && (selStart || rangeConflict) &&
        renderSummaryPanel(selStart, selEnd, nights, rangeConflict, room, s, C)
      }
    </>
  );

  const confirmBtnNode = (
    <Pressable
      style={[s.confirmBtn, !canConfirm && s.confirmDim, rangeConflict && s.confirmConflict]}
      disabled={!canConfirm || rangeConflict}
      onPress={() => {
        // A booking is about to be created for this room — the cached
        // availability for its months is now stale, so drop it. The
        // next time this room's calendar is viewed it will re-fetch.
        if (room) invalidateRoomCache(room.id);
        onConfirm(selStart!, mode === "single" ? selStart! : selEnd!);
      }}
    >
      <Text style={s.confirmTxt}>{ctaLabel}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>

          {/* Room header */}
          <View style={s.roomHdr}>
            <View style={s.roomBadge}>
              <Text style={s.roomBadgeTxt}>{badgeLabel ?? "ROOM"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.roomName}>{room.name}</Text>
              <Text style={s.roomMeta}>
                {room.capacity ? `${room.capacity} guests  ·  ` : ""}
                {room.nightly_rate
                  ? `${peso(room.nightly_rate)}/night`
                  : room.hourly_rate > 0
                    ? `${peso(room.hourly_rate)}/hr`
                    : "Rate not configured"}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={16} style={s.closeBtn}>
              <Feather name="x" size={20} color={C.ink3} />
            </Pressable>
          </View>

          {wide ? (
            /* Two-column: calendar (own step hint + legend, scoped to just
               this column instead of stretching over the sidebar) + a
               docked selection/price/action panel that's always in view —
               choosing dates never requires scrolling to see the total, and
               the confirm action lives with the summary it belongs to
               instead of a separate full-width bar. */
            <View style={s.bodyRow}>
              <View style={s.calendarColWrap}>
                <View style={[s.hintBox, selEnd && s.hintBoxDone]}>
                  <Text style={[s.hintStep, selEnd && { color: C.good }]}>{hintStep}</Text>
                  <Text style={s.hintTxt}>{hintTxt}</Text>
                  {(selStart || selEnd) && (
                    <Pressable
                      onPress={() => { setSelStart(null); setSelEnd(null); setRangeConflict(false); }}
                      hitSlop={12} style={s.clearBtn}
                    >
                      <Text style={s.clearBtnTxt}>Clear</Text>
                    </Pressable>
                  )}
                </View>
                <View style={s.legendBar}>{legendNode}</View>
                <ScrollView style={s.calendarCol} showsVerticalScrollIndicator={false}>
                  {calendarBody}
                </ScrollView>
              </View>
              <ScrollView style={s.summaryCol} showsVerticalScrollIndicator={false}>
                <Text style={s.summaryColTitle}>Your Selection</Text>
                {renderSummaryPanel(selStart, selEnd, nights, rangeConflict, room, s, C)}

                <View style={s.summaryColDivider} />
                <Text style={s.summaryColTitle}>{MONTHS[month.getMonth()]} at a Glance</Text>
                <View style={s.monthStatRow}>
                  <View style={s.monthStatItem}>
                    <Text style={s.monthStatNum}>{monthStats.available}</Text>
                    <Text style={s.monthStatLbl}>Available</Text>
                  </View>
                  <View style={s.monthStatDivider} />
                  <View style={s.monthStatItem}>
                    <Text style={[s.monthStatNum, { color: C.bad }]}>{monthStats.occupied}</Text>
                    <Text style={s.monthStatLbl}>Occupied</Text>
                  </View>
                </View>

                <View style={s.summaryColCta}>
                  {confirmBtnNode}
                </View>
              </ScrollView>
            </View>
          ) : (
            <>
              {/* Step hint bar */}
              <View style={[s.hintBox, selEnd && s.hintBoxDone]}>
                <Text style={[s.hintStep, selEnd && { color: C.good }]}>{hintStep}</Text>
                <Text style={s.hintTxt}>{hintTxt}</Text>
                {(selStart || selEnd) && (
                  <Pressable
                    onPress={() => { setSelStart(null); setSelEnd(null); setRangeConflict(false); }}
                    hitSlop={12} style={s.clearBtn}
                  >
                    <Text style={s.clearBtnTxt}>Clear</Text>
                  </Pressable>
                )}
              </View>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {calendarBody}
              </ScrollView>
            </>
          )}

          {/* Footer — phone only; wide docks the same button in the sidebar */}
          {!wide && (
            <View style={s.footer}>
              {confirmBtnNode}
            </View>
          )}

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (C: C, cellW: number, sheetWidth: number) => StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.70)",
    justifyContent: "center", alignItems: "center", padding: 16,
  },
  sheet: {
    backgroundColor: C.bg2, borderRadius: R.xl,
    height: "90%", width: sheetWidth, overflow: "hidden",
  },

  // Two-column body (tablet+, range mode) — calendar left (with its own
  // step-hint + legend, scoped to this column instead of the whole modal),
  // docked summary right, so the total is always visible without scrolling.
  // calendarColWrap gets an explicit width (matching the cellW math below
  // exactly) instead of flex:1 — a ScrollView's cross-axis flex resolution
  // inside a row can lag/mismatch the width used to size the day cells,
  // causing the grid to overflow past the sidebar divider.
  bodyRow:        { flex: 1, flexDirection: "row" },
  calendarColWrap:{ width: sheetWidth - SUMMARY_COL_W, flexGrow: 0, flexShrink: 0 },
  calendarCol:    { flex: 1 },
  summaryCol: {
    width: SUMMARY_COL_W, flexShrink: 0,
    borderLeftWidth: 1, borderLeftColor: C.line,
    paddingTop: 16, backgroundColor: C.surface,
  },
  summaryColTitle: {
    color: C.ink4, fontSize: 10, fontWeight: "700", fontFamily: MONO,
    letterSpacing: 1, textTransform: "uppercase",
    paddingHorizontal: 16, marginBottom: 12,
  },
  summaryColDivider: {
    height: 1, backgroundColor: C.lineSoft,
    marginHorizontal: 16, marginTop: 16, marginBottom: 12,
  },

  // "Month at a Glance" quick reference
  monthStatRow: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, backgroundColor: C.bg2, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line, paddingVertical: 10,
  },
  monthStatItem:  { flex: 1, alignItems: "center", gap: 2 },
  monthStatNum:   { color: C.ink, fontSize: 18, fontWeight: "800", fontFamily: MONO },
  monthStatLbl:   { color: C.ink4, fontSize: 9, fontFamily: MONO, letterSpacing: 0.5, textTransform: "uppercase" },
  monthStatDivider: { width: 1, alignSelf: "stretch", backgroundColor: C.line },

  // Confirm CTA docked at the end of the sidebar instead of a full-width
  // footer spanning the whole modal.
  summaryColCta: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20 },

  // Room header
  roomHdr: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  roomBadge: {
    backgroundColor: `${C.rust}22`, borderRadius: R.sm,
    borderWidth: 1, borderColor: `${C.rust}44`,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  roomBadgeTxt: { color: C.rust, fontSize: 9, fontWeight: "700", fontFamily: MONO, letterSpacing: 1 },
  roomName:     { color: C.ink, fontSize: 18, fontWeight: "700" },
  roomMeta:     { color: C.ink3, fontSize: 12, fontFamily: MONO, marginTop: 2 },
  closeBtn:     { padding: 4 },

  // Step hint bar
  hintBox: {
    backgroundColor: `${C.amber}0D`,
    borderBottomWidth: 1, borderBottomColor: `${C.amber}22`,
    paddingHorizontal: 20, paddingVertical: 11,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  hintBoxDone: { backgroundColor: `${C.good}0D`, borderBottomColor: `${C.good}22` },

  // Legend bar — wide layout only, sits under the hint bar so the sidebar
  // doesn't have to carry it (keeps the sidebar short enough to never scroll).
  legendBar: {
    borderBottomWidth: 1, borderBottomColor: C.lineSoft,
    paddingVertical: 8,
  },
  hintStep: {
    color: C.amber, fontSize: 9, fontWeight: "700", fontFamily: MONO,
    letterSpacing: 0.8, textTransform: "uppercase", minWidth: 80,
  },
  hintTxt: { flex: 1, color: C.ink2, fontSize: 12, fontFamily: MONO },
  clearBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: `${C.ink}14`, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line,
  },
  clearBtnTxt: { color: C.ink3, fontSize: 11, fontFamily: MONO },

  // Month nav
  monthRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingTop: 14, paddingBottom: 8,
  },
  navBtn:    { paddingHorizontal: 14, paddingVertical: 4 },
  navArrow:  { color: C.amber, fontSize: 28, fontWeight: "700", lineHeight: 32 },
  navDim:    { opacity: 0.2 },
  monthLabel:{ color: C.ink, fontSize: 16, fontWeight: "700" },

  // Day headers
  weekRow: {
    flexDirection: "row",
    paddingHorizontal: 16, paddingBottom: 8,
    borderTopWidth: 1, borderTopColor: C.line, marginBottom: 4,
  },
  weekDay: {
    width: cellW, textAlign: "center",
    color: C.ink3, fontSize: 12, fontFamily: MONO, fontWeight: "700",
  },

  // Grid
  loadBox: { height: 200, alignItems: "center", justifyContent: "center" },
  grid:    { paddingHorizontal: 16 },
  gridRow: { flexDirection: "row" },

  cell: {
    width: cellW, height: CELL_H,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  cellRange:    { backgroundColor: `${C.amber}1E` },
  // Solid, edge-to-edge — one square red block, not a circle floating
  // inside a lighter tint (matches the app's square/no-radius theme).
  cellOccupied: { backgroundColor: C.bad },

  halfBg: {
    position: "absolute", top: 0, bottom: 0,
    backgroundColor: `${C.amber}1E`,
  },

  inner: {
    width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
    alignItems: "center", justifyContent: "center",
  },
  innerSel: { backgroundColor: C.amber },

  dayN:   { color: C.ink, fontSize: 17 },
  tPast:  { color: C.ink4, fontSize: 17 },
  tOcc:   { color: "#fff", fontSize: 16, fontWeight: "700" },
  tOccLabel: {
    color: "#fff", fontSize: 8, fontWeight: "700", fontFamily: MONO,
    letterSpacing: 0.3, marginTop: 1, opacity: 0.85,
  },
  tSel:   { color: C.bg, fontWeight: "700", fontSize: 17 },
  tRange: { color: C.amber, fontSize: 17 },
  tToday: { color: C.amber, fontWeight: "700", fontSize: 17 },
  tDep:   { color: C.good, fontSize: 17 },

  todayDot: {
    position: "absolute", bottom: 5,
    width: 4, height: 4, borderRadius: 2, backgroundColor: C.amber,
  },

  // Legend — centered row below the grid on phone (own top border to
  // separate it from the calendar above it).
  legend: {
    flexDirection: "row", justifyContent: "center", gap: 16, flexWrap: "wrap",
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.lineSoft,
  },
  // In the header legendBar (wide layout) — no border of its own, the bar
  // already has one, and less vertical padding since the bar supplies it.
  legendInBar: {
    borderTopWidth: 0, paddingVertical: 0,
  },
  lgItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  lgDot:  { width: 8, height: 8, borderRadius: 4 },
  lgTxt:  { color: C.ink4, fontSize: 10, fontFamily: MONO },

  // Date summary panel
  summaryPanel: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line, padding: 14, gap: 10,
  },
  summaryRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  summaryItem: { flex: 1, gap: 3 },
  summaryItemLabel: {
    color: C.ink4, fontSize: 9, fontFamily: MONO, letterSpacing: 0.8, textTransform: "uppercase",
  },
  summaryItemValue: { color: C.ink, fontSize: 13, fontWeight: "600" },
  summaryPlaceholder: { color: C.ink4, fontStyle: "italic", fontWeight: "400" },
  summaryArrowWrap: { paddingHorizontal: 4 },
  summaryArrow: { color: C.ink4, fontSize: 16 },
  summaryNights: {
    alignItems: "center", paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: `${C.amber}18`, borderRadius: R.md,
    borderWidth: 1, borderColor: `${C.amber}33`,
  },
  summaryNightsNum:   { color: C.amber, fontSize: 18, fontWeight: "800", fontFamily: MONO },
  summaryNightsLabel: { color: C.amber, fontSize: 9, fontFamily: MONO, marginTop: -2 },

  // Price preview
  priceBox: {
    backgroundColor: `${C.amber}0A`, borderRadius: R.md,
    borderWidth: 1, borderColor: `${C.amber}22`, padding: 12, gap: 8,
  },
  // priceLbl gets flex:1 + numberOfLines so a long breakdown ("5 nights ×
  // ₱3,500.00") truncates instead of visually overlapping priceVal when
  // the sidebar is too narrow to fit both on one line at full width.
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  priceLbl: { flex: 1, color: C.ink3, fontSize: 11, fontFamily: MONO },
  priceVal: { color: C.ink2, fontSize: 12, fontFamily: MONO, flexShrink: 0 },
  priceDivider: { height: 1, backgroundColor: `${C.amber}22` },
  priceTotalLbl: { color: C.ink4, fontSize: 9, fontFamily: MONO, fontWeight: "700", letterSpacing: 0.8 },
  priceTotalVal: { color: C.amber, fontSize: 16, fontWeight: "800", fontFamily: MONO },

  // No rate warning
  noPriceBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: `${C.warn}14`, borderRadius: R.md,
    borderWidth: 1, borderColor: `${C.warn}33`, padding: 10,
  },
  noPriceTxt: { color: C.warn, fontSize: 12, flex: 1 },

  // Conflict warning
  conflictBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: `${C.bad}14`, borderRadius: R.md,
    borderWidth: 1, borderColor: `${C.bad}33`,
    padding: 10,
  },
  conflictTxt: { color: C.bad, fontSize: 12, flex: 1, lineHeight: 17 },

  // Footer
  footer: {
    padding: 16, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: C.line,
  },
  confirmBtn: {
    backgroundColor: C.rust, borderRadius: R.lg,
    padding: 16, alignItems: "center",
  },
  confirmDim:      { opacity: 0.35 },
  confirmConflict: { backgroundColor: `${C.bad}33`, opacity: 1 },
  confirmTxt: { color: "#fff", fontSize: 14, fontWeight: "700", fontFamily: MONO },
});
