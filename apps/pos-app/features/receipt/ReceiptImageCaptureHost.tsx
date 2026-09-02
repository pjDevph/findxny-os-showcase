/**
 * Always-mounted, invisible renderer for image-based receipt printing —
 * see receiptImageBridge.ts for why this needs to exist as a component at
 * all (a plain async function can't render JSX or capture a view; something
 * has to actually mount PrintableReceiptView for react-native-view-shot to
 * capture it). Kept within the normal screen bounds at opacity:0, NOT
 * positioned off-screen — a view placed outside the visible viewport can be
 * skipped by Android's rendering pipeline entirely (never rasterized since
 * it never intersects the screen), which is exactly what happened here:
 * captures came back as blank white images. opacity:0 keeps it in the
 * drawn/composited view tree (just invisible to the eye), which is what
 * actually makes it capturable.
 */
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as FileSystem from "expo-file-system/legacy";
import { PrintableReceiptView } from "./PrintableReceiptView";
import { useCaptureJob, resolveReceiptCapture, rejectReceiptCapture } from "./receiptImageBridge";

// TEMPORARY debug aid — copies every capture to a fixed, predictable path so
// it can be pulled off the device and inspected directly (adb shell run-as
// <pkg> cat files/receipt_debug.png), instead of only ever judging the
// capture by whether the physical print came out right. Remove once the
// image print path is confirmed stable.
const DEBUG_SAVE_PATH = `${FileSystem.documentDirectory}receipt_debug.png`;

export function ReceiptImageCaptureHost() {
  const job = useCaptureJob();
  const viewRef = useRef<View>(null);

  useEffect(() => {
    if (!job) return;
    // Let the newly-rendered off-screen view actually commit and lay out
    // before capturing — capturing on the same tick the job first appears
    // can grab a stale/empty frame.
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        try {
          if (!viewRef.current) throw new Error("Printable receipt view not mounted");
          // No width/height options here on purpose — view-shot's native
          // Android code only resizes when BOTH are given (checked the
          // source), so a width-only option was silently ignored and it
          // captured at native resolution (dp × the device's own pixel
          // ratio) instead of the intended pixel width. Capturing at native
          // resolution is now correct BY DESIGN: PrintableReceiptView lays
          // itself out at `pixelWidth / PixelRatio.get()` dp specifically so
          // that native-resolution capture comes out to exactly pixelWidth
          // real pixels, matching what the printer expects.
          const uri = await captureRef(viewRef.current, { format: "png", quality: 1, result: "tmpfile" });
          try {
            await FileSystem.copyAsync({ from: uri, to: DEBUG_SAVE_PATH });
            console.log(`[ReceiptImageCaptureHost] debug copy saved to ${DEBUG_SAVE_PATH}`);
          } catch (copyErr) {
            console.log("[ReceiptImageCaptureHost] debug copy failed:", copyErr);
          }
          resolveReceiptCapture(uri);
        } catch (e) {
          rejectReceiptCapture(e);
        }
      });
    });
    return () => cancelAnimationFrame(id);
  }, [job]);

  if (!job) return null;

  return (
    <View
      style={{ position: "absolute", left: 0, top: 0, opacity: 0 }}
      pointerEvents="none"
      collapsable={false}
    >
      <View ref={viewRef} collapsable={false}>
        <PrintableReceiptView
          payload={job.payload}
          config={job.config}
          storeName={job.storeName}
          copyLabel={job.copyLabel}
          mode={job.mode}
          showTin={job.showTin}
          includeSku={job.includeSku}
          pixelWidth={job.pixelWidth}
        />
      </View>
    </View>
  );
}
