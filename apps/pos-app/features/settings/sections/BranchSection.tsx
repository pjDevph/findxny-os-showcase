import { View, Text, Pressable, TextInput, Switch, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { SectionLabel, Card } from "../SettingsCard";
import type { makeStyles } from "../settingsScreenStyles";
import type { useBranchOperations } from "../useBranchOperations";

interface Props {
  readonly branchApi: ReturnType<typeof useBranchOperations>;
  readonly canEditApprovalCode: boolean;
  readonly s: ReturnType<typeof makeStyles>;
}

export function BranchSection({ branchApi, canEditApprovalCode, s }: Props) {
  const { C } = useTheme();
  const {
    branches, branchesLoading, togglingBranch, toggleBranchField,
    registersByBranch, registersLoading, newRegisterName, setNewRegisterName, savingRegister,
    addRegister, setRegisterActive,
  } = branchApi;

  return (
    <>
      <SectionLabel label="Branch Operations" />
      <Card>
        {branchesLoading ? (
          <ActivityIndicator color={C.amber} />
        ) : branches.length === 0 ? (
          <Text style={s.helpNote}>No branches found</Text>
        ) : (
          branches.map((branch, i) => (
            <View key={branch.id}>
              {i > 0 && <View style={s.rateDivider} />}
              <View style={s.branchBlock}>
                <Text style={s.branchName}>{branch.name}</Text>
                <View style={s.branchToggleRow}>
                  <View style={s.branchToggleLabel}>
                    <Feather name="shopping-bag" size={14} color={branch.accepting_orders ? C.good : C.ink4} />
                    <View>
                      <Text style={[s.branchToggleTitle, !branch.accepting_orders && s.branchToggleTitleOff]}>Accepting Orders</Text>
                      <Text style={s.branchToggleSub}>{branch.accepting_orders ? "Orders are open" : "Orders paused"}</Text>
                    </View>
                  </View>
                  <Switch value={branch.accepting_orders}
                    onValueChange={async (val) => { try { await toggleBranchField(branch.id, "accepting_orders", val); } catch (e) { console.error(e); } }}
                    trackColor={{ false: C.line, true: `${C.good}66` }} thumbColor={branch.accepting_orders ? C.good : C.ink3}
                    disabled={togglingBranch !== null} />
                </View>
                <View style={s.branchToggleRow}>
                  <View style={s.branchToggleLabel}>
                    <Feather name="calendar" size={14} color={branch.accepting_bookings ? C.info : C.ink4} />
                    <View>
                      <Text style={[s.branchToggleTitle, !branch.accepting_bookings && s.branchToggleTitleOff]}>Accepting Bookings</Text>
                      <Text style={s.branchToggleSub}>{branch.accepting_bookings ? "Bookings are open" : "Bookings paused"}</Text>
                    </View>
                  </View>
                  <Switch value={branch.accepting_bookings}
                    onValueChange={async (val) => { try { await toggleBranchField(branch.id, "accepting_bookings", val); } catch (e) { console.error(e); } }}
                    trackColor={{ false: C.line, true: `${C.info}66` }} thumbColor={branch.accepting_bookings ? C.info : C.ink3}
                    disabled={togglingBranch !== null} />
                </View>

                {canEditApprovalCode && (
                  <View style={s.registerBlock}>
                    <Text style={s.registerBlockLabel}>Registers</Text>
                    {registersLoading[branch.id] ? (
                      <ActivityIndicator color={C.amber} size="small" />
                    ) : (registersByBranch[branch.id] ?? []).length === 0 ? (
                      <Text style={s.helpNote}>No registers yet — cashiers can't start a shift here until one is added.</Text>
                    ) : (
                      (registersByBranch[branch.id] ?? []).map((reg) => (
                        <View key={reg.id} style={s.registerRow}>
                          <View style={[s.registerDot, { backgroundColor: reg.is_active ? C.good : C.ink4 }]} />
                          <Text style={[s.registerName, !reg.is_active && { color: C.ink4, textDecorationLine: "line-through" }]}>
                            {reg.name}
                          </Text>
                          <Pressable
                            onPress={() => setRegisterActive(branch.id, reg.id, !reg.is_active)}
                            disabled={savingRegister === reg.id}
                            style={[s.registerToggleBtn, savingRegister === reg.id && { opacity: 0.5 }]}
                          >
                            <Text style={s.registerToggleBtnTxt}>{reg.is_active ? "Deactivate" : "Reactivate"}</Text>
                          </Pressable>
                        </View>
                      ))
                    )}
                    <View style={s.registerAddRow}>
                      <TextInput
                        style={[s.input, { flex: 1 }]}
                        placeholder="e.g. Register 3"
                        placeholderTextColor={C.ink4}
                        value={newRegisterName[branch.id] ?? ""}
                        onChangeText={(v) => setNewRegisterName((p) => ({ ...p, [branch.id]: v }))}
                        maxLength={40}
                      />
                      <Pressable
                        style={[s.registerAddBtn, (!newRegisterName[branch.id]?.trim() || savingRegister === branch.id) && { opacity: 0.5 }]}
                        onPress={() => addRegister(branch.id)}
                        disabled={!newRegisterName[branch.id]?.trim() || savingRegister === branch.id}
                      >
                        {savingRegister === branch.id
                          ? <ActivityIndicator size="small" color="#000000" />
                          : <Feather name="plus" size={16} color="#000000" />
                        }
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </Card>
    </>
  );
}
