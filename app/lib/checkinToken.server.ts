import crypto from "node:crypto";

const secret = process.env.SESSION_SECRET;

if (!secret) {
  throw new Error("SESSION_SECRET must be set");
}

/**
 * Firma HMAC del id de la ventana. Se incluye en la URL del QR (`?t=...`)
 * para que solo quien tiene el QR físico pueda confirmar la llegada en el
 * endpoint público /api/windows/:id/arrive.
 */
export function checkinToken(windowId: string): string {
  return crypto
    .createHmac("sha256", secret!)
    .update(windowId)
    .digest("hex")
    .slice(0, 32);
}

export function verifyCheckinToken(
  windowId: string,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const expected = Buffer.from(checkinToken(windowId));
  const received = Buffer.from(token);
  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}
