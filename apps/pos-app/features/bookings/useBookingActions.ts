import { useState } from "react";
import type { useRouter } from "expo-router";
import { invokeFn } from "../../services/supabase";
import { fmtDT, parseNotes } from "./bookingsHelpers";
import type { BlockType, Booking, SuccessInfo } from "./types";

export function useBookingActions(
  activeWorkspaceId: string | null | undefined,
  activeBranchId: string | null | undefined,
  router: ReturnType<typeof useRouter>,
  load: (force?: boolean) => Promise<void>,
) {
  const [checkActionLoading, setCheckActionLoading] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [noShowTarget, setNoShowTarget] = useState<Booking | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Booking | null>(null);
  const [refundTarget, setRefundTarget] = useState<Booking | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Booking | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);

  async function confirmBooking(b: Booking) {
    const { error } = await invokeFn("bookings-confirm", { workspace_id: activeWorkspaceId, booking_id: b.id });
    if (error) { setErrorMsg(error.message); return; }
    const { guestName, guestPhone } = parseNotes(b.notes);
    load(true);
    setSuccessInfo({
      roomName: b.resource_name ?? "Room", guestName, guestPhone,
      checkIn: fmtDT(b.start_time), checkOut: fmtDT(b.end_time),
      startISO: b.start_time, endISO: b.end_time,
      total: b.total, status: "confirmed",
      bookingId: b.id, branchId: b.branch_id ?? activeBranchId ?? "",
    });
  }

  async function doCancelBooking(b: Booking) {
    setCancelTarget(null);
    const { error } = await invokeFn("bookings-cancel", { workspace_id: activeWorkspaceId, booking_id: b.id });
    if (error) setErrorMsg(error.message); else load(true);
  }

  async function doCheckIn(b: Booking) {
    setCheckActionLoading(b.id);
    const { error } = await invokeFn("bookings-check-in", { workspace_id: activeWorkspaceId, booking_id: b.id, action: "check_in" });
    setCheckActionLoading(null);
    if (error) setErrorMsg(error.message); else load(true);
  }

  async function doCheckOut(b: Booking) {
    setCheckActionLoading(b.id);
    const { error } = await invokeFn("bookings-check-in", { workspace_id: activeWorkspaceId, booking_id: b.id, action: "check_out" });
    setCheckActionLoading(null);
    if (error) setErrorMsg(error.message); else load(true);
  }

  async function doNoShow(b: Booking) {
    setNoShowTarget(null);
    setCheckActionLoading(b.id);
    const { error } = await invokeFn("bookings-no-show", { workspace_id: activeWorkspaceId, booking_id: b.id });
    setCheckActionLoading(null);
    if (error) setErrorMsg(error.message); else load(true);
  }

  async function doComplete(b: Booking) {
    setCompleteTarget(null);
    setCheckActionLoading(b.id);
    const { error } = await invokeFn("bookings-complete", { workspace_id: activeWorkspaceId, booking_id: b.id });
    setCheckActionLoading(null);
    if (error) setErrorMsg(error.message); else load(true);
  }

  async function doRefund(booking: Booking, amount: number, method: string, reason: string) {
    setRefundTarget(null);
    const { error } = await invokeFn("bookings-refund", {
      workspace_id: activeWorkspaceId, booking_id: booking.id,
      amount, method, reason,
    });
    if (error) setErrorMsg(error.message); else load(true);
  }

  async function doMarkPaid(b: Booking) {
    setCheckActionLoading(b.id);
    const { error } = await invokeFn("bookings-mark-paid", { workspace_id: activeWorkspaceId, booking_id: b.id });
    setCheckActionLoading(null);
    if (error) setErrorMsg(error.message); else load(true);
  }

  async function doReschedule(b: Booking, newStartISO: string, newEndISO: string, reason: string) {
    const { error } = await invokeFn("bookings-reschedule", {
      workspace_id: activeWorkspaceId, booking_id: b.id,
      new_start_time: newStartISO, new_end_time: newEndISO,
      ...(reason ? { reason } : {}),
    });
    if (error) { setErrorMsg(error.message); return; }
    setRescheduleTarget(null);
    load(true);
  }

  async function doBlockResource(resourceId: string, startDate: string, endDate: string, blockType: BlockType, reason: string) {
    const { error } = await invokeFn("bookings-block-resource", {
      workspace_id: activeWorkspaceId, resource_id: resourceId,
      branch_id: activeBranchId, start_date: startDate, end_date: endDate,
      block_type: blockType, ...(reason ? { reason } : {}),
    });
    if (error) { setErrorMsg(error.message); return; }
    setShowBlockModal(false);
    load(true);
  }

  function doCollectCash(b: Booking) {
    const p = new URLSearchParams({
      preload_id: b.id,
      preload_rid: b.resource_id,
      preload_rname: b.resource_name ?? "Room",
      preload_bid: b.branch_id ?? activeBranchId ?? "",
      preload_start: b.start_time,
      preload_end: b.end_time,
      preload_total: String(b.total),
      preload_notes: b.notes ?? "",
    });
    router.push(`/pos/order?${p.toString()}`);
  }

  return {
    checkActionLoading, successInfo, setSuccessInfo, errorMsg, setErrorMsg,
    cancelTarget, setCancelTarget, noShowTarget, setNoShowTarget,
    completeTarget, setCompleteTarget, refundTarget, setRefundTarget,
    rescheduleTarget, setRescheduleTarget, showBlockModal, setShowBlockModal,
    detailBooking, setDetailBooking,
    confirmBooking, doCancelBooking, doCheckIn, doCheckOut, doNoShow, doComplete,
    doRefund, doMarkPaid, doReschedule, doBlockResource, doCollectCash,
  };
}
