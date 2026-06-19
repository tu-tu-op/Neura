import { createNetworkConfig } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

export const { networkConfig, useNetworkVariable, useNetworkVariables } = createNetworkConfig({
  testnet: {
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
    variables: {
      packageId:
        import.meta.env.NEXT_PUBLIC_SUI_PACKAGE_ID_TESTNET ??
        import.meta.env.NEXT_PUBLIC_SUI_PACKAGE_ID ??
        ""
    }
  },
  mainnet: {
    url: getJsonRpcFullnodeUrl("mainnet"),
    network: "mainnet",
    variables: {
      packageId:
        import.meta.env.NEXT_PUBLIC_SUI_PACKAGE_ID_MAINNET ??
        import.meta.env.NEXT_PUBLIC_SUI_PACKAGE_ID ??
        ""
    }
  }
});

export type SuiNetwork = keyof typeof networkConfig;

const configuredNetwork = import.meta.env.NEXT_PUBLIC_SUI_NETWORK;

export const DEFAULT_NETWORK: SuiNetwork = configuredNetwork === "mainnet" ? "mainnet" : "testnet";
