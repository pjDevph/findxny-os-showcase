/**
 * KeyboardSheet — drop-in replacement for a bottom-sheet modal's backdrop View.
 *
 * Wraps the modal body in a KeyboardAvoidingView so the on-screen keyboard
 * pushes the sheet up instead of covering its inputs. Use it in place of the
 * `<View style={modalBd}>` that holds a bottom sheet:
 *
 *   <Modal transparent ...>
 *     <KeyboardSheet style={s.modalBd}>
 *       <Pressable style={{flex:1}} onPress={close} />
 *       <View style={s.sheet}>… inputs in a ScrollView …</View>
 *     </KeyboardSheet>
 *   </Modal>
 *
 * On Android `behavior="height"` shrinks the flex container so the flex-end
 * sheet sits above the keyboard; on iOS `padding` adds matching bottom inset.
 * Pair with a ScrollView using `keyboardShouldPersistTaps="handled"` and bottom
 * safe-area padding for the last fields/buttons.
 */
import { KeyboardAvoidingView, Platform, View, StyleProp, ViewStyle } from "react-native";

/**
 * On Android the manifest sets windowSoftInputMode="adjustResize", so the OS
 * already shrinks the window when the keyboard appears. Adding KeyboardAvoidingView
 * on top causes a double-adjustment flicker. Render a plain View on Android;
 * iOS still needs the padding behaviour.
 */
export function KeyboardSheet({
  style, children, pointerEvents,
}: Readonly<{
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  pointerEvents?: "box-none" | "none" | "box-only" | "auto";
}>) {
  if (Platform.OS !== "ios") {
    return <View style={style} pointerEvents={pointerEvents}>{children}</View>;
  }
  return (
    <KeyboardAvoidingView style={style} behavior="padding" pointerEvents={pointerEvents}>
      {children}
    </KeyboardAvoidingView>
  );
}
