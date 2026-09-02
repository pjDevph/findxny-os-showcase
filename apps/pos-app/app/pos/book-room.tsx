import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, Modal, ActivityIndicator, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { RoomCalendar } from "../../features/bookings/RoomCalendar";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { KeyboardSheet } from "../../features/ui/KeyboardSheet";
import { ConfirmActionModal } from "../../features/ui/ConfirmActionModal";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { makeStyles } from "../../features/bookings/bookingsScreenStyles";
import { useBookingsData } from "../../features/bookings/useBookingsData";
import { useBookingFilters } from "../../features/bookings/useBookingFilters";
import { useBookingActions } from "../../features/bookings/useBookingActions";
import { useBookingForm } from "../../features/bookings/useBookingForm";
import { BookingCard } from "../../features/bookings/BookingCard";
import { DetailModal } from "../../features/bookings/DetailModal";
import { SuccessModal } from "../../features/bookings/SuccessModal";
import { RefundModal } from "../../features/bookings/RefundModal";
import { RescheduleModal } from "../../features/bookings/RescheduleModal";
import { BlockResourceModal } from "../../features/bookings/BlockResourceModal";
import { DatePickerModal } from "../../features/bookings/DatePickerModal";
import { AvailabilityView } from "../../features/bookings/AvailabilityView";
import { BookingFormContent } from "../../features/bookings/BookingFormContent";
import type { DatePickTarget, ViewMode } from "../../features/bookings/types";

const SORT_LABELS: Record<string, string> = { newest: "Newest", oldest: "Oldest", checkin_asc: "CI ↑", checkin_desc: "CI ↓" };
const STATUS_LABELS: Record<string, string> = { all: "All Status", hold: "Hold", confirmed: "Confirmed", checked_in: "Checked In", completed: "Completed", cancelled: "Cancelled" };
const PAYMENT_LABELS: Record<string, string> = { all: "All Pay", unpaid: "Unpaid", partial: "Partial", paid: "Paid" };

export default function BookRoomScreen() {
  const { activeWorkspaceId, activeBranchId, role } = useAuth();
  const canBlock = role === "owner" || role === "admin" || role === "manager";
  const router = useRouter();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { isPhone, isDesktop } = useBreakpoint();
  const bookingColumns = isPhone ? 1 : isDesktop ? 3 : 2;

  const { resources, bookings, loading, load, dataVersion } = useBookingsData(activeWorkspaceId);
  const filters = useBookingFilters(bookings, resources);
  const actions = useBookingActions(activeWorkspaceId, activeBranchId, router, load);
  const bookingForm = useBookingForm(activeWorkspaceId, activeBranchId, resources, load, actions.setSuccessInfo, actions.setErrorMsg);

  const [availCheckIn, setAvailCheckIn] = useState(() => new Date().toISOString().slice(0, 10));
  const [availCheckOut, setAvailCheckOut] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [datePickTarget, setDatePickTarget] = useState<DatePickTarget>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("bookings");

  function openForm() { router.push("/pos/order?open_tab=room"); }

  const SC: Record<string, string> = {
    hold: C.warn, confirmed: C.good,
    checked_in: C.rust, checked_out: C.amber,
    completed: C.ink3, cancelled: C.bad, no_show: C.bad, expired: C.ink4,
  };

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <DatePickerModal
        visible={datePickTarget !== null}
        value={
          datePickTarget === "filterCI" ? (filters.filterCheckIn || new Date().toISOString().slice(0, 10)) :
          datePickTarget === "filterCO" ? (filters.filterCheckOut || new Date().toISOString().slice(0, 10)) :
          datePickTarget === "availCI" ? availCheckIn :
          datePickTarget === "availCO" ? availCheckOut :
          new Date().toISOString().slice(0, 10)
        }
        onSelect={(d) => {
          if (datePickTarget === "filterCI") { filters.setFilterCheckIn(d); filters.setBookPage(1); }
          if (datePickTarget === "filterCO") { filters.setFilterCheckOut(d); filters.setBookPage(1); }
          if (datePickTarget === "availCI") {
            setAvailCheckIn(d);
            if (d >= availCheckOut) {
              const next = new Date(d + "T12:00:00");
              next.setDate(next.getDate() + 1);
              setAvailCheckOut(next.toISOString().slice(0, 10));
            }
          }
          if (datePickTarget === "availCO") {
            setAvailCheckOut(d);
            if (d <= availCheckIn) {
              const prev = new Date(d + "T12:00:00");
              prev.setDate(prev.getDate() - 1);
              setAvailCheckIn(prev.toISOString().slice(0, 10));
            }
          }
        }}
        onClose={() => setDatePickTarget(null)}
        C={C}
        resources={
          datePickTarget === "availCI" || datePickTarget === "availCO"
            ? resources.filter(r => r.type === "room")
            : undefined
        }
        bookings={
          datePickTarget === "availCI" || datePickTarget === "availCO"
            ? bookings
            : undefined
        }
      />

      <PosScreenHeader
        title="Book Room"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {canBlock && (
              <Pressable style={s.blockDatesBtn} onPress={() => actions.setShowBlockModal(true)}>
                <Feather name="slash" size={14} color={C.ink2} />
                <Text style={s.blockDatesBtnTxt}>Block Dates</Text>
              </Pressable>
            )}
            <Pressable style={s.newBookingBtn} onPress={openForm}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={s.newBookingBtnTxt}>New Booking</Text>
            </Pressable>
          </View>
        }
      />

      <BlockResourceModal
        visible={actions.showBlockModal}
        resources={resources}
        s={s} C={C}
        onClose={() => actions.setShowBlockModal(false)}
        onSubmit={actions.doBlockResource}
      />

      <View style={s.viewTabBar}>
        {(["bookings", "availability"] as ViewMode[]).map((m) => (
          <Pressable key={m} style={[s.viewTab, viewMode === m && s.viewTabActive]} onPress={() => setViewMode(m)}>
            <Text style={[s.viewTabTxt, viewMode === m && s.viewTabTxtActive]}>
              {m === "bookings" ? "Bookings" : "Availability"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={s.statsStrip}>
        <View style={[s.statChip, { borderColor: `${C.good}44` }]}>
          <Text style={[s.statChipVal, { color: C.good }]}>{filters.stats.available}</Text>
          <Text style={s.statChipLbl}>Free</Text>
        </View>
        <View style={[s.statChip, { borderColor: `${C.amber}44` }]}>
          <Text style={[s.statChipVal, { color: C.amber }]}>{filters.stats.reserved}</Text>
          <Text style={s.statChipLbl}>Reserved</Text>
        </View>
        <View style={[s.statChip, { borderColor: `${C.warn}44` }]}>
          <Text style={[s.statChipVal, { color: C.warn }]}>{filters.stats.checkIns}</Text>
          <Text style={s.statChipLbl}>Due In</Text>
        </View>
        <View style={[s.statChip, { borderColor: `${C.rust}44` }]}>
          <Text style={[s.statChipVal, { color: C.rust }]}>{filters.stats.checkedIn}</Text>
          <Text style={s.statChipLbl}>In-House</Text>
        </View>
        <View style={[s.statChip, { borderColor: `${C.bad}44` }]}>
          <Text style={[s.statChipVal, { color: C.bad }]}>{filters.stats.pendingPay}</Text>
          <Text style={s.statChipLbl}>Unpaid</Text>
        </View>
      </View>

      {viewMode === "bookings" && (
        <>
          <View style={s.searchWrap}>
            <Feather name="search" size={14} color={C.ink4} style={{ marginLeft: 12 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Search guest, phone, room, reference…"
              placeholderTextColor={C.ink4}
              value={filters.search}
              onChangeText={(v) => { filters.setSearch(v); filters.setBookPage(1); }}
              clearButtonMode="while-editing"
            />
            {filters.search.length > 0 && (
              <Pressable onPress={() => filters.setSearch("")} hitSlop={8} style={{ marginRight: 12 }}>
                <Feather name="x" size={14} color={C.ink4} />
              </Pressable>
            )}
          </View>

          <View style={{ height: 58, flexShrink: 0 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              <Pressable style={s.filterDateBtn} onPress={() => setDatePickTarget("filterCI")}>
                <Text style={s.filterDateLabel}>CHECK-IN</Text>
                <Text style={s.filterDateVal}>{filters.filterCheckIn ? new Date(filters.filterCheckIn + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "Any date"}</Text>
              </Pressable>
              <Pressable style={s.filterDateBtn} onPress={() => setDatePickTarget("filterCO")}>
                <Text style={s.filterDateLabel}>CHECK-OUT</Text>
                <Text style={s.filterDateVal}>{filters.filterCheckOut ? new Date(filters.filterCheckOut + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "Any date"}</Text>
              </Pressable>
              <Pressable style={s.filterDropBtn} onPress={() => {
                const opts = ["all", ...resources.map(r => r.id)];
                filters.setFilterRoom(opts[(opts.indexOf(filters.filterRoom) + 1) % opts.length]);
                filters.setBookPage(1);
              }}>
                <Text style={s.filterDropLabel}>ROOM</Text>
                <Text style={s.filterDropVal} numberOfLines={1}>{filters.filterRoom === "all" ? "All Rooms" : (resources.find(r => r.id === filters.filterRoom)?.name ?? "All")} ▾</Text>
              </Pressable>
              <Pressable style={s.filterDropBtn} onPress={() => {
                const opts = ["all","hold","confirmed","checked_in","completed","cancelled"];
                filters.setFilterStatus(opts[(opts.indexOf(filters.filterStatus) + 1) % opts.length]);
                filters.setBookPage(1);
              }}>
                <Text style={s.filterDropLabel}>STATUS</Text>
                <Text style={s.filterDropVal}>{STATUS_LABELS[filters.filterStatus] ?? filters.filterStatus} ▾</Text>
              </Pressable>
              <Pressable style={s.filterDropBtn} onPress={() => {
                const opts = ["all","unpaid","partial","paid"];
                filters.setFilterPayment(opts[(opts.indexOf(filters.filterPayment) + 1) % opts.length]);
                filters.setBookPage(1);
              }}>
                <Text style={s.filterDropLabel}>PAYMENT</Text>
                <Text style={s.filterDropVal}>{PAYMENT_LABELS[filters.filterPayment] ?? filters.filterPayment} ▾</Text>
              </Pressable>
              <Pressable style={s.filterDropBtn} onPress={() => {
                const opts = ["newest","oldest","checkin_asc","checkin_desc"] as const;
                filters.setFilterSort(opts[(opts.indexOf(filters.filterSort) + 1) % opts.length]);
              }}>
                <Text style={s.filterDropLabel}>SORT</Text>
                <Text style={s.filterDropVal}>{SORT_LABELS[filters.filterSort]} ▾</Text>
              </Pressable>
              {Boolean(filters.filterCheckIn || filters.filterCheckOut || filters.filterRoom !== "all" || filters.filterStatus !== "all" || filters.filterPayment !== "all") && (
                <Pressable style={s.filterClearBtn} onPress={filters.clearFilters}>
                  <Feather name="x" size={11} color={C.bad} />
                  <Text style={s.filterClearTxt}>Clear</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>

          <View style={s.tabBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBarContent}>
              {([
                ["all", "Active"],
                ["today", "Today"],
                ["upcoming", "Upcoming"],
                ["pending_pay", "Pending Pay"],
                ["checked_in", "Checked-in"],
                ["cancelled", "Cancelled"],
              ] as const).map(([key, label]) => (
                <Pressable key={key} style={[s.tab, filters.bookQuickFilter === key && s.tabActive]}
                  onPress={() => { filters.setBookQuickFilter(key); filters.setBookPage(1); }}>
                  <Text style={[s.tabTxt, filters.bookQuickFilter === key && s.tabTxtActive]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {loading ? (
            <View style={s.center}><ActivityIndicator color={C.amber} /></View>
          ) : (
            <>
              <FlatList
                key={bookingColumns}
                style={{ flex: 1 }}
                data={filters.paginatedBookings}
                keyExtractor={(b) => b.id}
                numColumns={bookingColumns}
                columnWrapperStyle={bookingColumns > 1 ? { gap: 8 } : undefined}
                contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
                renderItem={({ item: b }) => (
                  <View style={{ flex: 1 }}>
                    <BookingCard
                      b={b} s={s} C={C} SC={SC}
                      checkActionLoading={actions.checkActionLoading}
                      onPress={() => actions.setDetailBooking(b)}
                      onConfirm={() => actions.confirmBooking(b)}
                      onCheckIn={() => actions.doCheckIn(b)}
                      onCheckOut={() => actions.doCheckOut(b)}
                      onCancel={() => actions.setCancelTarget(b)}
                      onCollectCash={() => actions.doCollectCash(b)}
                      onNoShow={() => actions.setNoShowTarget(b)}
                      onComplete={() => actions.setCompleteTarget(b)}
                    />
                  </View>
                )}
                ListEmptyComponent={
                  <View style={s.center}>
                    <Feather name="calendar" size={40} color={C.ink4} />
                    <Text style={s.emptyTxt}>
                      {filters.search ? "No bookings match your search" : "No bookings found"}
                    </Text>
                    {!filters.search && filters.bookQuickFilter === "all" && (
                      <Text style={s.emptySub}>Tap + New Booking to create one</Text>
                    )}
                  </View>
                }
              />
              {filters.totalFiltered > 0 && (
                <View style={s.paginationBar}>
                  <Text style={s.paginationInfo}>
                    Showing {Math.min((filters.bookPage - 1) * filters.BOOK_PAGE_SIZE + 1, filters.totalFiltered)}–{Math.min(filters.bookPage * filters.BOOK_PAGE_SIZE, filters.totalFiltered)} of {filters.totalFiltered} bookings
                  </Text>
                  <View style={s.paginationBtns}>
                    <Pressable
                      style={[s.paginationBtn, filters.bookPage <= 1 && s.paginationBtnDisabled]}
                      onPress={() => filters.setBookPage(p => Math.max(1, p - 1))}
                      disabled={filters.bookPage <= 1}
                    >
                      <Feather name="chevron-left" size={14} color={filters.bookPage <= 1 ? C.ink4 : C.ink2} />
                      <Text style={[s.paginationBtnTxt, filters.bookPage <= 1 && { color: C.ink4 }]}>Prev</Text>
                    </Pressable>
                    <Text style={s.paginationPage}>{filters.bookPage}/{filters.totalPages}</Text>
                    <Pressable
                      style={[s.paginationBtn, filters.bookPage >= filters.totalPages && s.paginationBtnDisabled]}
                      onPress={() => filters.setBookPage(p => Math.min(filters.totalPages, p + 1))}
                      disabled={filters.bookPage >= filters.totalPages}
                    >
                      <Text style={[s.paginationBtnTxt, filters.bookPage >= filters.totalPages && { color: C.ink4 }]}>Next</Text>
                      <Feather name="chevron-right" size={14} color={filters.bookPage >= filters.totalPages ? C.ink4 : C.ink2} />
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          )}
        </>
      )}

      {viewMode === "availability" && (
        <AvailabilityView
          resources={resources}
          bookings={bookings}
          checkIn={availCheckIn}
          checkOut={availCheckOut}
          onCheckInChange={(d) => {
            setAvailCheckIn(d);
            if (d >= availCheckOut) {
              const next = new Date(d + "T12:00:00");
              next.setDate(next.getDate() + 1);
              setAvailCheckOut(next.toISOString().slice(0, 10));
            }
          }}
          onCheckOutChange={(d) => {
            setAvailCheckOut(d);
            if (d <= availCheckIn) {
              const prev = new Date(d + "T12:00:00");
              prev.setDate(prev.getDate() - 1);
              setAvailCheckIn(prev.toISOString().slice(0, 10));
            }
          }}
          onOpenDatePicker={(target) => setDatePickTarget(target)}
          loading={loading}
          s={s} C={C}
          onViewCalendar={bookingForm.handleRoomSelect}
          onBook={() => router.push("/pos/order?open_tab=room")}
          onViewBooking={(b) => actions.setDetailBooking(b)}
        />
      )}

      <Modal visible={bookingForm.showForm} animationType="fade" transparent onRequestClose={() => bookingForm.setShowForm(false)}>
        <KeyboardSheet style={s.modalBd}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => bookingForm.setShowForm(false)} />
          <View style={s.modalKav} pointerEvents="box-none">
            <BookingFormContent
              resources={resources} form={bookingForm.form} selected={bookingForm.selected}
              hours={bookingForm.hours} totalAmt={bookingForm.totalAmt} saving={bookingForm.saving} canSubmit={bookingForm.canSubmit}
              fieldErrors={bookingForm.fieldErrors}
              s={s} C={C}
              onRoomSelect={bookingForm.handleRoomSelect}
              onSetFormField={bookingForm.setFormField}
              onBlurName={bookingForm.blurName}
              onBlurPhone={bookingForm.blurPhone}
              onSaveConfirmed={() => bookingForm.saveBooking(true)}
              onClose={bookingForm.closeForm}
            />
          </View>
        </KeyboardSheet>
      </Modal>

      <DetailModal
        booking={actions.detailBooking} s={s} C={C} SC={SC}
        checkActionLoading={actions.checkActionLoading}
        onClose={() => actions.setDetailBooking(null)}
        onConfirm={(b) => { actions.setDetailBooking(null); actions.confirmBooking(b); }}
        onCheckIn={(b) => { actions.setDetailBooking(null); actions.doCheckIn(b); }}
        onCheckOut={(b) => { actions.setDetailBooking(null); actions.doCheckOut(b); }}
        onCancel={(b) => { actions.setDetailBooking(null); actions.setCancelTarget(b); }}
        onCollectCash={(b) => { actions.setDetailBooking(null); actions.doCollectCash(b); }}
        onNoShow={(b) => { actions.setDetailBooking(null); actions.setNoShowTarget(b); }}
        onComplete={(b) => { actions.setDetailBooking(null); actions.setCompleteTarget(b); }}
        onRefund={(b) => { actions.setDetailBooking(null); actions.setRefundTarget(b); }}
        onMarkPaid={(b) => { actions.setDetailBooking(null); actions.doMarkPaid(b); }}
        onReschedule={(b) => { actions.setDetailBooking(null); actions.setRescheduleTarget(b); }}
      />

      <RescheduleModal
        booking={actions.rescheduleTarget} s={s} C={C}
        onClose={() => actions.setRescheduleTarget(null)}
        onDone={actions.doReschedule}
      />

      <SuccessModal
        successInfo={actions.successInfo} s={s} C={C}
        onClose={() => actions.setSuccessInfo(null)}
        onCollectNow={actions.successInfo?.bookingId && actions.successInfo.status === "confirmed" ? () => {
          const si = actions.successInfo!;
          actions.setSuccessInfo(null);
          const p = new URLSearchParams({
            preload_id: si.bookingId!,
            preload_rid: "",
            preload_rname: si.roomName,
            preload_bid: si.branchId ?? activeBranchId ?? "",
            preload_start: si.startISO,
            preload_end: si.endISO,
            preload_total: String(si.total),
            preload_notes: [si.guestName, si.guestPhone].filter(Boolean).join(" · "),
          });
          router.push(`/pos/order?${p.toString()}`);
        } : undefined}
      />

      <ConfirmActionModal
        visible={!!actions.cancelTarget}
        icon="alert-triangle" iconColor={C.bad}
        title="Cancel Booking?"
        body={
          <Text style={s.alertBody}>
            Cancel the booking for <Text style={{ color: C.ink, fontWeight: "700" }}>{actions.cancelTarget?.resource_name ?? "this room"}</Text>?{"\n"}This cannot be undone.
          </Text>
        }
        onCancel={() => actions.setCancelTarget(null)}
        onConfirm={() => actions.cancelTarget && actions.doCancelBooking(actions.cancelTarget)}
        confirmLabel="Cancel Booking"
        cancelLabel="Keep"
      />

      <ConfirmActionModal
        visible={!!actions.noShowTarget}
        icon="user-x" iconColor={C.warn}
        title="Mark as No-Show?"
        body={
          <Text style={s.alertBody}>
            Mark the booking for{" "}
            <Text style={{ color: C.ink, fontWeight: "700" }}>{actions.noShowTarget?.resource_name ?? "this room"}</Text>
            {" "}as a no-show?{"\n"}This cannot be undone.
          </Text>
        }
        onCancel={() => actions.setNoShowTarget(null)}
        onConfirm={() => actions.noShowTarget && actions.doNoShow(actions.noShowTarget)}
        confirmLabel="No Show"
        cancelLabel="Keep"
      />

      <ConfirmActionModal
        visible={!!actions.completeTarget}
        icon="check-circle" iconColor={C.good}
        title="Close Out Booking?"
        body={
          <Text style={s.alertBody}>
            Complete the booking for{" "}
            <Text style={{ color: C.ink, fontWeight: "700" }}>{actions.completeTarget?.resource_name ?? "this room"}</Text>
            {" "}and close billing?{"\n"}This cannot be undone.
          </Text>
        }
        onCancel={() => actions.setCompleteTarget(null)}
        onConfirm={() => actions.completeTarget && actions.doComplete(actions.completeTarget)}
        confirmLabel="Complete"
      />

      <RefundModal booking={actions.refundTarget} s={s} C={C} onClose={() => actions.setRefundTarget(null)} onDone={actions.doRefund} />

      <ConfirmActionModal
        visible={!!actions.errorMsg}
        icon="alert-circle" iconColor={C.bad}
        title="Something went wrong"
        body={actions.errorMsg ?? ""}
        onCancel={() => actions.setErrorMsg(null)}
      />

      <RoomCalendar
        visible={bookingForm.calendarOpen}
        room={bookingForm.calendarRoom ? { ...bookingForm.calendarRoom, hourly_rate: bookingForm.calendarRoom.hourly_rate ?? 0 } : null}
        workspaceId={activeWorkspaceId ?? ""}
        onConfirm={bookingForm.handleCalendarConfirm}
        onClose={() => bookingForm.setCalendarOpen(false)}
        refreshKey={dataVersion}
      />
    </View>
  );
}
