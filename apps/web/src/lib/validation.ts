const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const BYTES32_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const UINT_STRING_PATTERN = /^(0|[1-9][0-9]*)$/;

export function isAddress(value: string) {
  return ADDRESS_PATTERN.test(value.trim());
}

export function isBytes32(value: string) {
  return BYTES32_PATTERN.test(value.trim());
}

export function isUintString(value: string) {
  return UINT_STRING_PATTERN.test(value.trim());
}

export function hasMetadataReference(metadataUri: string, metadataHash: string) {
  return metadataUri.trim().length > 0 || metadataHash.trim().length > 0;
}

export function generateBytes32Hex() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
