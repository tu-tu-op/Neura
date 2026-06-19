export type WalrusNetwork = "testnet" | "mainnet";

function getWalrusNetwork(): WalrusNetwork {
  return process.env.WALRUS_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

function getSuiRpcUrl(network: WalrusNetwork) {
  return process.env.SUI_RPC_URL ?? `https://fullnode.${network}.sui.io:443`;
}

async function createSuiClient() {
  const { SuiGrpcClient } = await import("@mysten/sui/grpc");
  const network = getWalrusNetwork();

  return new SuiGrpcClient({
    network,
    baseUrl: getSuiRpcUrl(network)
  });
}

let suiClientPromise: ReturnType<typeof createSuiClient> | null = null;

export function getSuiClient() {
  suiClientPromise ??= createSuiClient();
  return suiClientPromise;
}

async function createWalrusClient() {
  const [{ WalrusClient }, suiClient] = await Promise.all([
    import("@mysten/walrus"),
    getSuiClient()
  ]);
  const network = getWalrusNetwork();
  const uploadRelayUrl = process.env.WALRUS_UPLOAD_RELAY_URL?.trim();

  return new WalrusClient({
    network,
    suiClient,
    ...(uploadRelayUrl
      ? {
          uploadRelay: {
            host: uploadRelayUrl,
            sendTip: { max: 1_000 }
          }
        }
      : {})
  });
}

let walrusClientPromise: ReturnType<typeof createWalrusClient> | null = null;

export function getWalrusClient() {
  walrusClientPromise ??= createWalrusClient();
  return walrusClientPromise;
}

export async function getAgentSigner() {
  const secret = process.env.SUI_AGENT_PRIVATE_KEY?.trim();

  if (!secret) {
    throw new Error(
      "SUI_AGENT_PRIVATE_KEY is not set. The agent needs a funded Sui keypair with SUI and WAL to write to Walrus."
    );
  }

  const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
  return Ed25519Keypair.fromSecretKey(secret);
}

export function resetWalrusClientsForTests() {
  suiClientPromise = null;
  walrusClientPromise = null;
}
