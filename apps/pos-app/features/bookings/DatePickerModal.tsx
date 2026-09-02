import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeColors } from "./bookingsScreenStyles";
import type { Booking, Resource } from "./types";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_ABBR = ["Su","Mo","Tu","We","Th","Fr","Sa"];

interface Props {
  readonly visible: boolean;
  readonly value: string;
  readonly onSelect: (d: string) => void;
  readonly onClose: () => void;
  readonly C: ThemeColors;
  /** When both are given (the Availability tab's check-in/check-out fields),
   * each day cell also shows a 2x2 grid of per-room dots — green/red for
   * available/occupied — so you can compare all 4 rooms at a glance while
   * picking a date instead of checking them one at a time. Omitted for the
   * plain booking-list date filters, which don't need room awareness. */
  readonly resources?: Resource[];
  readonly bookings?: Booking[];
}

export function DatePickerModal({ visible, value, onSelect, onClose, C, resources, bookings }: Props) {
  const [year, setYear] = useState(() => parseInt(value.slice(0, 4)));
  const [month, setMonth] = useState(() => parseInt(value.slice(5, 7)) - 1);
  const dotRooms = (resources ?? []).slice(0, 4);
  const showRoomDots = dotRooms.length > 0 && !!bookings;

  function roomDayOccupied(resourceId: string, iso: string): boolean {
    if (!bookings) return false;
    const dayStart = new Date(iso + "T00:00:00");
    const dayEnd = new Date(iso + "T23:59:59");
    return bookings.some(b =>
      b.resource_id === resourceId &&
      b.status !== "cancelled" &&
      new Date(b.start_time) < dayEnd &&
      new Date(b.end_time) > dayStart
    );
  }

  useEffect(() => {
    if (visible) {
      setYear(parseInt(value.slice(0, 4)));
      setMonth(parseInt(value.slice(5, 7)) - 1);
    }
  }, [visible, value]);

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m);
    setYear(y);
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  function toISO(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const cellH = showRoomDots ? 68 : 52;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} style={{ backgroundColor: C.bg2, borderRadius: 20, padding: 20, width: "90%", maxWidth: showRoomDots ? 460 : 400 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
            <Pressable onPress={() => shiftMonth(-1)} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }}>
              <Feather name="chevron-left" size={24} color={C.ink2} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: "center", color: C.ink, fontSize: 17, fontWeight: "700" }}>
              {MONTH_NAMES[month]} {year}
            </Text>
            <Pressable onPress={() => shiftMonth(1)} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }}>
              <Feather name="chevron-right" size={24} color={C.ink2} />
            </Pressable>
          </View>

          {showRoomDots && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14, paddingHorizontal: 2 }}>
              {dotRooms.map((r, i) => (
                <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Text style={{ color: C.ink4, fontSize: 10, fontFamily: "monospace", fontWeight: "700" }}>{i + 1}</Text>
                  <Text style={{ color: C.ink3, fontSize: 11 }} numberOfLines={1}>{r.name}</Text>
                </View>
              ))}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginLeft: "auto" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: C.good }} />
                  <Text style={{ color: C.ink4, fontSize: 10 }}>Open</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: C.bad }} />
                  <Text style={{ color: C.ink4, fontSize: 10 }}>Booked</Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            {DAY_ABBR.map(d => (
              <Text key={d} style={{ flex: 1, textAlign: "center", color: C.ink4, fontSize: 12, fontWeight: "700" }}>{d}</Text>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View key={ri} style={{ flexDirection: "row" }}>
              {row.map((day, ci) => {
                if (!day) return <View key={ci} style={{ flex: 1, height: cellH }} />;
                const iso = toISO(day);
                const isToday = iso === todayStr;
                const isSel = iso === value;
                return (
                  <Pressable
                    key={ci}
                    onPress={() => { onSelect(iso); onClose(); }}
                    style={{
                      flex: 1, height: cellH, alignItems: "center", justifyContent: "center",
                      borderRadius: 12, gap: 3,
                      backgroundColor: isSel ? C.amber : isToday ? `${C.amber}28` : "transparent",
                    }}
                  >
                    <Text style={{
                      fontSize: 15, fontWeight: isSel || isToday ? "700" : "400",
                      color: isSel ? "#000000" : isToday ? C.amber : C.ink2,
                    }}>{day}</Text>
                    {showRoomDots && (
                      <View style={{ width: 20, flexDirection: "row", flexWrap: "wrap", gap: 2, justifyContent: "center" }}>
                        {dotRooms.map(r => (
                          <View
                            key={r.id}
                            style={{
                              width: 7, height: 7, borderRadius: 2,
                              backgroundColor: roomDayOccupied(r.id, iso)
                                ? (isSel ? "#000000" : C.bad)
                                : (isSel ? "#00000055" : C.good),
                            }}
                          />
                        ))}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Pressable onPress={onClose} style={{ marginTop: 12, alignItems: "center", paddingVertical: 8 }}>
            <Text style={{ color: C.ink4, fontSize: 13 }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
