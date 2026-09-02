/**
 * Rooms / Amenities tab — resource grid plus the inline quick-booking form
 * shown once a resource is selected.
 *
 * Extracted from app/pos/order.tsx. Shared by both the "room" and "amenity"
 * tabs; `activeTab` only changes the wording and which rate applies.
 */
import { View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "../ui/KeyboardAwareScrollView";
import { useTheme } from "../theme/ThemeContext";
import { peso } from "./format";
import type { Resource, Tab } from "./types";
import type { OrderScreenStyles } from "./orderScreenStyles";

interface Props {
  readonly activeTab: Tab;
  readonly resourcesLoaded: boolean;
  readonly tabResources: Resource[];
  readonly selRes: Resource | null;
  readonly setSelRes: (r: Resource | null) => void;
  readonly bCheckIn: string;  readonly setBCheckIn: (v: string) => void;
  readonly bCheckOut: string; readonly setBCheckOut: (v: string) => void;
  readonly bStartTime: string;
  readonly bEndTime: string;
  readonly bGuest: string;    readonly setBGuest: (v: string) => void;
  readonly bNotes: string;    readonly setBNotes: (v: string) => void;
  readonly bHrsActual: number;
  readonly onSelectResource: (r: Resource) => void;
  readonly bNights: number;
  readonly bIsNightly: boolean;
  readonly bFormTotal: number;
  readonly bCanAdd: boolean;
  readonly onAddBooking: () => void;
  readonly setCalendarOpen: (v: boolean) => void;
  readonly setTimePickerOpen: (v: boolean) => void;
  readonly setShowBookingModal: (v: boolean) => void;
  readonly s: OrderScreenStyles;
  readonly C: ReturnType<typeof useTheme>["C"];
}

export function ResourcesTab(p: Props) {
  const {
    activeTab, resourcesLoaded, tabResources, selRes, setSelRes,
    bCheckIn, setBCheckIn, bCheckOut, setBCheckOut, bStartTime, bEndTime,
    bGuest, setBGuest, bNotes, setBNotes, bHrsActual, onSelectResource,
    bNights, bIsNightly, bFormTotal, bCanAdd,
    onAddBooking, setCalendarOpen, setTimePickerOpen, setShowBookingModal, s, C,
  } = p;
  return (
    <KeyboardAwareScrollView contentContainerStyle={s.resourceContent} showsVerticalScrollIndicator={false}>
              {!resourcesLoaded ? (
                <ActivityIndicator color={C.amber} style={{ marginTop: 40 }} />
              ) : tabResources.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Text style={s.emptyText}>No {activeTab === "room" ? "rooms" : "amenities"} configured</Text>
                </View>
              ) : (
                <>
                  <Text style={s.resourceHint}>Tap a {activeTab === "room" ? "room" : "facility"} to add it to this order</Text>
                  <View style={s.resourceGrid}>
                    {tabResources.map(r => {
                      const isSelected = selRes?.id === r.id;
                      return (
                        <Pressable
                          key={r.id}
                          style={[s.resourceTile, isSelected && s.resourceTileActive]}
                          onPress={() => onSelectResource(r)}
                        >
                          <Text style={[s.resourceName, isSelected && { color: C.amber }]} numberOfLines={2}>
                            {r.name}
                          </Text>
                          {r.capacity ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Feather name="users" size={10} color={C.ink4} />
                              <Text style={s.resourceCap}>{r.capacity} pax</Text>
                            </View>
                          ) : null}
                          <Text style={[s.resourceRate, isSelected && { color: C.amber }]}>
                            {r.type === "room" && r.nightly_rate != null
                              ? `${peso(r.nightly_rate)}/night`
                              : `${peso(r.hourly_rate)}/hr`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Amenity: keep inline form (uses visual time picker, minimal keyboard) */}
                  {selRes && selRes.type === "amenity" && (
                    <View style={s.bForm}>
                      <View style={s.bFormHead}>
                        <Text style={s.bFormTitle}>{selRes.name}</Text>
                        <Pressable onPress={() => { setSelRes(null); setBCheckIn(""); setBCheckOut(""); }}>
                          <Text style={{ color: C.ink4, fontSize: 18 }}>✕</Text>
                        </Pressable>
                      </View>
                      {!bCheckIn ? (
                        <Pressable style={s.bDatePickerBtn} onPress={() => setCalendarOpen(true)}>
                          <Text style={s.bDatePickerTxt}>Tap to select a date</Text>
                        </Pressable>
                      ) : (
                        <>
                          <Pressable style={s.bDateBar} onPress={() => setCalendarOpen(true)}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.bDateBarLabel}>DATE</Text>
                              <Text style={s.bDateBarValue}>{bCheckIn}</Text>
                            </View>
                            <Text style={s.bDateBarEdit}>✎ Change</Text>
                          </Pressable>
                          <Pressable style={s.bDateBar} onPress={() => setTimePickerOpen(true)}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.bDateBarLabel}>TIME RANGE</Text>
                              <Text style={s.bDateBarValue}>{bStartTime}  →  {bEndTime}</Text>
                            </View>
                            <Text style={s.bDateBarEdit}>✎ Change</Text>
                          </Pressable>
                          <Text style={s.bLabel}>GUEST NAME (optional)</Text>
                          <TextInput style={s.bInput} placeholder="Juan dela Cruz"
                            placeholderTextColor={C.ink4} value={bGuest} onChangeText={setBGuest} />
                          <Text style={s.bLabel}>NOTES (optional)</Text>
                          <TextInput style={[s.bInput, { minHeight: 48, textAlignVertical: "top" }]}
                            placeholder="Special requests…" placeholderTextColor={C.ink4}
                            multiline value={bNotes} onChangeText={setBNotes} />
                          <View style={s.bTotalRow}>
                            <Text style={s.bTotalLabel}>{bHrsActual.toFixed(1)}h × {peso(selRes.hourly_rate)}/hr</Text>
                            <Text style={s.bTotalAmt}>{peso(bFormTotal)}</Text>
                          </View>
                          <Pressable style={[s.bAddBtn, !bCanAdd && { opacity: 0.5 }]}
                            onPress={onAddBooking} disabled={!bCanAdd}>
                            <Text style={s.bAddBtnTxt}>Add to Order · {peso(bFormTotal)}</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  )}

                  {/* Room: compact summary card — full form opens in modal */}
                  {selRes && selRes.type === "room" && (
                    <View style={s.bRoomCard}>
                      <View style={s.bFormHead}>
                        <Text style={s.bFormTitle}>{selRes.name}</Text>
                        <Pressable onPress={() => { setSelRes(null); setBCheckIn(""); setBCheckOut(""); setShowBookingModal(false); }}>
                          <Text style={{ color: C.ink4, fontSize: 18 }}>✕</Text>
                        </Pressable>
                      </View>
                      {bCheckIn ? (
                        <>
                          <Pressable style={s.bDateBar} onPress={() => setCalendarOpen(true)}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.bDateBarLabel}>DATES</Text>
                              <Text style={s.bDateBarValue}>{bCheckIn}  →  {bCheckOut}</Text>
                            </View>
                            <Text style={s.bDateBarEdit}>✎ Change</Text>
                          </Pressable>
                          <View style={s.bRoomCardMeta}>
                            <Text style={s.bRoomCardTime}>{bStartTime} check-in  ·  {bEndTime} check-out</Text>
                            {bGuest ? (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                                <Feather name="user" size={11} color={C.ink2} />
                                <Text style={s.bRoomCardGuest}>{bGuest}</Text>
                              </View>
                            ) : null}
                          </View>
                          {bHrsActual > 0 && (
                            <View style={s.bTotalRow}>
                              <Text style={s.bTotalLabel}>
                                {bIsNightly
                                  ? `${bNights} night${bNights !== 1 ? "s" : ""} × ${peso(selRes.nightly_rate!)}/night`
                                  : `${bHrsActual.toFixed(1)}h × ${peso(selRes.hourly_rate)}/hr`}
                              </Text>
                              <Text style={s.bTotalAmt}>{peso(bFormTotal)}</Text>
                            </View>
                          )}
                          {!bGuest.trim() && (
                            <Text style={{ color: C.bad, fontSize: 11, marginTop: 2 }}>
                              Guest name required to add to order
                            </Text>
                          )}
                          <View style={s.bRoomCardActions}>
                            <Pressable style={s.bRoomEditBtn} onPress={() => setShowBookingModal(true)}>
                              <Feather name="edit-2" size={13} color={C.amber} />
                              <Text style={s.bRoomEditBtnTxt}>Edit Details</Text>
                            </Pressable>
                            <Pressable style={[s.bAddBtn, { flex: 1 }, !bCanAdd && { opacity: 0.5 }]}
                              onPress={onAddBooking} disabled={!bCanAdd}>
                              <Text style={s.bAddBtnTxt}>Add to Order · {peso(bFormTotal)}</Text>
                            </Pressable>
                          </View>
                        </>
                      ) : (
                        <Pressable style={s.bDatePickerBtn} onPress={() => setCalendarOpen(true)}>
                          <Text style={s.bDatePickerTxt}>Tap to select check-in & check-out dates</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </>
              )}
            </KeyboardAwareScrollView>
  );
}
