import { createHash } from "node:crypto";

/**
 * Computes the backend-independent SHA-256 integrity hash stored alongside a
 * Walrus blob. A Walrus blob ID is not a plain content hash and cannot replace it.
 */
export function computeContentHash(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

export function contentHashToHex(hash: Uint8Array) {
  return Buffer.from(hash).toString("hex");
}
