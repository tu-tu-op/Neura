import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import "@mysten/dapp-kit/dist/index.css";

import { DEFAULT_NETWORK, networkConfig } from "./network-config";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000
    }
  }
});

export function SuiProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={DEFAULT_NETWORK}>
        {/* CHOSEN: dapp-kit 1.1.1 supports slushWallet, so Slush web is registered here once. */}
        <WalletProvider autoConnect preferredWallets={["Slush"]} slushWallet={{ name: "Neura" }}>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
