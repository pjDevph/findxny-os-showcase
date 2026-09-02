/**
 * Shared ESC/POS byte-builder primitives — thermal-printer command bytes and
 * text encoding/padding helpers used by every raw ESC/POS report generator.
 *
 * Previously duplicated near-verbatim between generateShiftReport.ts (the
 * shift-close report) and shift.tsx's own printZReport() (the X/Z report) —
 * same command bytes, same encode/pad logic, different names. One copy now.
 */

export const ESC = 0x1B;
export const GS = 0x1D;
export const LF = 0x0A;

export const CMD_INIT = [ESC, 0x40];
export const CMD_ALIGN_L = [ESC, 0x61, 0x00];
export const CMD_ALIGN_C = [ESC, 0x61, 0x01];
export const CMD_BOLD_ON = [ESC, 0x45, 0x01];
export const CMD_BOLD_OFF = [ESC, 0x45, 0x00];
export const CMD_FEED3 = [ESC, 0x64, 0x03];
export const CMD_CUT = [GS, 0x56, 0x41, 0x00]; // partial cut

export function encodeText(t: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i) & 0xFF);
  return out;
}

/** Pads/truncates to `len`, left-aligned (spaces added at the end). */
export function padEnd(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len);
  return s + " ".repeat(len - s.length);
}

/** Pads/truncates to `len`, right-aligned (spaces added at the start). */
export function padStart(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len);
  return " ".repeat(len - s.length) + s;
}

/** Byte-array writer shared by the ESC/POS report generators. */
export function createEscPosWriter() {
  const bytes: number[] = [];
  const push = (...cmds: number[][]): void => {
    for (const cmd of cmds) for (const b of cmd) bytes.push(b);
  };
  const text = (t: string): void => { for (const b of encodeText(t)) bytes.push(b); };
  const lf = (n = 1): void => { for (let i = 0; i < n; i++) bytes.push(LF); };
  return {
    push, text, lf,
    bytes: () => new Uint8Array(bytes),
  };
}
