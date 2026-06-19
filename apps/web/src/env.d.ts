/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly NEXT_PUBLIC_SUI_NETWORK?: "testnet" | "mainnet";
  readonly NEXT_PUBLIC_SUI_PACKAGE_ID?: string;
  readonly NEXT_PUBLIC_SUI_PACKAGE_ID_TESTNET?: string;
  readonly NEXT_PUBLIC_SUI_PACKAGE_ID_MAINNET?: string;
  readonly NEXT_PUBLIC_CORE_REGISTRY_ID?: string;
  readonly NEXT_PUBLIC_CORE_CONFIG_ID?: string;
  readonly NEXT_PUBLIC_ARTIFACT_REGISTRY_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
