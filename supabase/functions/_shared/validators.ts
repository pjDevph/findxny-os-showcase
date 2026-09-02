import { z, ZodSchema } from "https://esm.sh/zod@3.23.8";
import { ApiError, BadRequest } from "./errors.ts";

export { z };

// Independent of any per-field Zod .max() — a global backstop so a caller
// can't force a function to buffer an arbitrarily large body into memory
// before validation even runs (e.g. as a resource-exhaustion vector against
// unauthenticated public-* functions). 10MB comfortably covers the largest
// legitimate payloads today (workspaces-update's base64 receipt_logo /
// payment QR fields, each capped at 2,000,000 chars).
const MAX_BODY_BYTES = 10_000_000;

async function readBodyCapped(req: Request, maxBytes: number): Promise<string> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) throw BadRequest("Request body too large");
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw BadRequest("Request body too large");
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { buf.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(buf);
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    const text = await readBodyCapped(req, MAX_BODY_BYTES);
    raw = text ? JSON.parse(text) : {};
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw BadRequest("Invalid JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw BadRequest(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data;
}
