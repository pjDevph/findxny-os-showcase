"use client";
import HTMLFlipBookImport from "react-pageflip";
const HTMLFlipBook = HTMLFlipBookImport as any;

// Pass the ref as a plain prop (forwardedRef) to sidestep the
// next/dynamic forwardRef limitation — LoadableComponent doesn't
// forward React refs, so bookRef.current would always be null.
export default function FlipBookRef({ forwardedRef, ...props }: any) {
  return <HTMLFlipBook ref={forwardedRef} {...props} />;
}
