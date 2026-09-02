import { Modal, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { peso } from "../order/format";
import type { StyleMap, ThemeColors } from "./bookingsScreenStyles";
import type { SuccessInfo } from "./types";

interface Props {
  readonly successInfo: SuccessInfo | null;
  readonly s: StyleMap;
  readonly C: ThemeColors;
  readonly onClose: () => void;
  readonly onCollectNow?: () => void;
}

export function SuccessModal({ successInfo, s, C, onClose, onCollectNow }: Props) {
  const isConfirmed = successInfo?.status === "confirmed";
  const canCollect = isConfirmed && !!onCollectNow;
  return (
    <Modal visible={!!successInfo} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={s.centeredOverlay} onPress={onClose}>
        <Pressable style={s.successSheet} onPress={() => {}}>
          <View style={[s.successIconWrap, { backgroundColor: isConfirmed ? `${C.good}22` : `${C.amber}18` }]}>
            <Feather name={isConfirmed ? "check-circle" : "bookmark"} size={36} color={isConfirmed ? C.good : C.amber} />
          </View>
          <Text style={s.successTitle}>{isConfirmed ? "Booking Confirmed" : "Reservation Saved"}</Text>
          <View style={s.successDetails}>
            <View style={s.successRow}><Feather name="home" size={13} color={C.ink4} /><Text style={s.successDetailTxt}>{successInfo?.roomName}</Text></View>
            {!!successInfo?.guestName && <View style={s.successRow}><Feather name="user" size={13} color={C.ink4} /><Text style={s.successDetailTxt}>{successInfo.guestName}</Text></View>}
            <View style={s.successRow}><Feather name="calendar" size={13} color={C.ink4} /><Text style={s.successDetailTxt}>{successInfo?.checkIn}  →  {successInfo?.checkOut}</Text></View>
            {(successInfo?.total ?? 0) > 0 && (
              <View style={s.successRow}><Feather name="tag" size={13} color={C.ink4} /><Text style={[s.successDetailTxt, { color: C.amber, fontWeight: "700" }]}>{peso(successInfo?.total ?? 0)}</Text></View>
            )}
          </View>
          <View style={[s.successStatusBadge, { backgroundColor: isConfirmed ? `${C.good}18` : `${C.amber}14`, borderColor: isConfirmed ? `${C.good}40` : `${C.amber}40` }]}>
            <Text style={[s.successStatusTxt, { color: isConfirmed ? C.good : C.amber }]}>
              {isConfirmed ? "CONFIRMED" : "RESERVED · COLLECT ON CHECK-OUT"}
            </Text>
          </View>
          {canCollect ? (
            <View style={{ flexDirection: "row", gap: 10, alignSelf: "stretch" }}>
              <Pressable style={[s.successDoneBtn, { flex: 1 }]} onPress={onClose}>
                <Text style={s.successDoneBtnTxt}>Skip</Text>
              </Pressable>
              <Pressable style={[s.successDoneBtn, { flex: 2, backgroundColor: C.good, borderColor: C.good }]} onPress={onCollectNow}>
                <Feather name="dollar-sign" size={15} color="#000000" />
                <Text style={[s.successDoneBtnTxt, { color: "#000000", fontWeight: "700" }]}>Collect Payment</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={s.successDoneBtn} onPress={onClose}>
              <Text style={s.successDoneBtnTxt}>Done</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
