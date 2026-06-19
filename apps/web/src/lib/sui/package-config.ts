export const SUI_PACKAGE_ID = import.meta.env.NEXT_PUBLIC_SUI_PACKAGE_ID ?? "";
export const CORE_REGISTRY_ID = import.meta.env.NEXT_PUBLIC_CORE_REGISTRY_ID ?? "";
export const CORE_CONFIG_ID = import.meta.env.NEXT_PUBLIC_CORE_CONFIG_ID ?? "";
export const ARTIFACT_REGISTRY_ID = import.meta.env.NEXT_PUBLIC_ARTIFACT_REGISTRY_ID ?? "";

if (!SUI_PACKAGE_ID && !import.meta.env.NEXT_PUBLIC_SUI_PACKAGE_ID_TESTNET) {
  // eslint-disable-next-line no-console
  console.warn("[sui] NEXT_PUBLIC_SUI_PACKAGE_ID is not set - on-chain calls will fail.");
}
