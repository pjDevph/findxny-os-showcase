import { Pressable, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AnchoredDropdown } from "../../ui/AnchoredDropdown";
import type { AnchoredPosition } from "../../ui/useAnchoredDropdown";
import { useTheme } from "../../theme/ThemeContext";
import type { makeStyles } from "../printersScreenStyles";
import type { Printer, RoutingConfig } from "../types";
import type { PrinterDropdownField } from "../useRoutingConfig";

interface Props {
  readonly field: PrinterDropdownField | null;
  readonly position: AnchoredPosition;
  readonly onClose: () => void;
  readonly routing: RoutingConfig;
  readonly labelPrinters: Printer[];
  readonly kitchenPrinters: Printer[];
  readonly onSelect: (id: string) => void;
  readonly s: ReturnType<typeof makeStyles>;
}

export function PrinterPickerDropdown({ field, position, onClose, routing, labelPrinters, kitchenPrinters, onSelect, s }: Props) {
  const { C } = useTheme();
  const list = field === "drinkLabel" ? labelPrinters : kitchenPrinters;
  const selectedIdByField: Record<PrinterDropdownField, string> = {
    drinkLabel: routing.drinkLabelPrinterId,
    kitchenTicket: routing.kitchenTicketPrinterId,
    drinksTicket: routing.drinksTicketPrinterId,
  };
  const selectedId = field ? selectedIdByField[field] : null;

  return (
    <AnchoredDropdown visible={field !== null} position={position} onClose={onClose}>
      {list.map(p => {
        const isSelected = selectedId === p.id;
        return (
          <Pressable key={p.id} style={[s.ddItem, isSelected && s.ddItemActive]} onPress={() => onSelect(p.id)}>
            <Feather name="printer" size={14} color={C.ink3} />
            <Text style={[s.ddItemTxt, isSelected && { color: C.amber, fontWeight: "700" }]}>{p.name}</Text>
          </Pressable>
        );
      })}
    </AnchoredDropdown>
  );
}
