import { useMemo, useState } from "react";
import {
  useConnectWallet,
  useCurrentAccount,
  useDisconnectWallet,
  useWallets
} from "@mysten/dapp-kit";

type AvailableWallet = ReturnType<typeof useWallets>[number];

export interface WalletConnectionNotice {
  tone: "neutral" | "success" | "error";
  message: string;
}

interface WalletConnectButtonProps {
  onNotice: (notice: WalletConnectionNotice | null) => void;
}

export function WalletConnectButton({ onNotice }: WalletConnectButtonProps) {
  const account = useCurrentAccount();
  const wallets = useWallets();
  const connectMutation = useConnectWallet();
  const disconnectMutation = useDisconnectWallet();
  const [isOpen, setIsOpen] = useState(false);

  const sortedWallets = useMemo(
    () =>
      [...wallets].sort((left, right) => {
        const leftIsSlush = left.name.toLowerCase().includes("slush");
        const rightIsSlush = right.name.toLowerCase().includes("slush");
        return leftIsSlush === rightIsSlush ? left.name.localeCompare(right.name) : leftIsSlush ? -1 : 1;
      }),
    [wallets]
  );

  function connect(wallet: AvailableWallet) {
    onNotice({ tone: "neutral", message: `Opening ${wallet.name}...` });
    connectMutation.mutate(
      { wallet },
      {
        onSuccess: () => {
          setIsOpen(false);
          onNotice({ tone: "success", message: `${wallet.name} connected.` });
        },
        onError: (error) => onNotice({ tone: "error", message: formatWalletError(error) })
      }
    );
  }

  function disconnect() {
    onNotice({ tone: "neutral", message: "Disconnecting wallet..." });
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        setIsOpen(false);
        onNotice({ tone: "neutral", message: "Wallet disconnected." });
      },
      onError: (error) => onNotice({ tone: "error", message: formatWalletError(error) })
    });
  }

  const isPending = connectMutation.isPending || disconnectMutation.isPending;

  return (
    <div className={`wallet-menu-wrap ${isOpen ? "wallet-menu-open" : ""}`}>
      {account ? (
        <button
          type="button"
          className="button button-primary topbar-button button-connected"
          disabled={isPending}
          onClick={disconnect}
        >
          {disconnectMutation.isPending ? (
            <>
              <span className="button-spinner" aria-hidden="true" />
              Disconnecting...
            </>
          ) : (
            "Disconnect"
          )}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="button button-primary topbar-button wallet-connect-trigger"
            disabled={isPending}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((current) => !current)}
          >
            {connectMutation.isPending ? (
              <>
                <span className="button-spinner" aria-hidden="true" />
                Connecting...
              </>
            ) : (
              "Connect"
            )}
          </button>
          <div className="wallet-menu" role="menu">
            {sortedWallets.length === 0 ? (
              <p className="wallet-menu-empty">No Sui wallets detected.</p>
            ) : (
              sortedWallets.map((wallet) => (
                <button
                  className="wallet-menu-item"
                  disabled={isPending}
                  key={`${wallet.name}-${wallet.version}`}
                  type="button"
                  role="menuitem"
                  onClick={() => connect(wallet)}
                >
                  <WalletIcon wallet={wallet} />
                  <span>
                    <strong>{wallet.name}</strong>
                    <small>{wallet.name.toLowerCase().includes("slush") ? "Web, mobile or extension" : "Sui Wallet Standard"}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function WalletIcon({ wallet }: { wallet: AvailableWallet }) {
  return (
    <span className="wallet-option-icon" aria-hidden="true">
      {wallet.icon ? <img src={wallet.icon} alt="" /> : <span>{wallet.name.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

function formatWalletError(error: unknown) {
  return error instanceof Error ? error.message : "The wallet request failed.";
}
