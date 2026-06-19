import { createHash } from "node:crypto";

import type { AgentStorageConfig } from "../config";
import type { AgentArtifactStorageProof } from "./types";

export interface StoreArtifactInput {
  artifactId: string;
  content: unknown;
}

interface StoredWalrusBlob {
  blobId: string;
  blobObjectId: string | null;
  transactionDigest: string | null;
}

export class AgentArtifactStorage {
  constructor(private readonly config: AgentStorageConfig) {}

  async storeArtifact(input: StoreArtifactInput): Promise<AgentArtifactStorageProof> {
    const bytes = new TextEncoder().encode(JSON.stringify(input.content));
    const contentHash = hashArtifactBytes(bytes);

    if (!this.config.enabled) {
      return buildPreparedStorageProof(input.artifactId, contentHash);
    }

    try {
      const stored = this.config.privateKey
        ? await this.uploadViaSdk(bytes)
        : await this.uploadViaPublisherHttp(bytes);

      return {
        provider: "WALRUS",
        status: "stored",
        contentHash,
        blobId: stored.blobId,
        blobObjectId: stored.blobObjectId,
        transactionDigest: stored.transactionDigest,
        uri: `walrus://${stored.blobId}`,
        network: this.config.network,
        aggregatorUrl: this.config.aggregatorUrl,
        uploadedAt: new Date().toISOString(),
        errorMessage: null
      };
    } catch (sdkError) {
      if (this.config.privateKey && this.config.publisherUrl && this.config.network === "testnet") {
        try {
          const stored = await this.uploadViaPublisherHttp(bytes);
          return {
            provider: "WALRUS",
            status: "stored",
            contentHash,
            blobId: stored.blobId,
            blobObjectId: null,
            transactionDigest: null,
            uri: `walrus://${stored.blobId}`,
            network: this.config.network,
            aggregatorUrl: this.config.aggregatorUrl,
            uploadedAt: new Date().toISOString(),
            errorMessage: null
          };
        } catch (fallbackError) {
          return this.unavailableProof(
            input.artifactId,
            contentHash,
            `${formatError(sdkError)} HTTP fallback also failed: ${formatError(fallbackError)}`
          );
        }
      }

      return this.unavailableProof(input.artifactId, contentHash, formatError(sdkError));
    }
  }

  private async uploadViaSdk(bytes: Uint8Array): Promise<StoredWalrusBlob> {
    if (!this.config.privateKey) {
      throw new Error("SUI_AGENT_PRIVATE_KEY is required for Walrus SDK uploads.");
    }

    const [{ WalrusClient }, { SuiGrpcClient }, { Ed25519Keypair }] = await Promise.all([
      import("@mysten/walrus"),
      import("@mysten/sui/grpc"),
      import("@mysten/sui/keypairs/ed25519")
    ]);
    const suiClient = new SuiGrpcClient({
      network: this.config.network,
      baseUrl: this.config.suiRpcUrl
    });
    const walrusClient = new WalrusClient({
      network: this.config.network,
      suiClient,
      ...(this.config.uploadRelayUrl
        ? {
            uploadRelay: {
              host: this.config.uploadRelayUrl,
              sendTip: { max: 1_000 }
            }
          }
        : {})
    });
    const signer = Ed25519Keypair.fromSecretKey(this.config.privateKey);
    let transactionDigest: string | null = null;
    const result = await walrusClient.writeBlob({
      blob: bytes,
      deletable: true,
      epochs: this.config.defaultEpochs,
      signer,
      onStep: (step) => {
        if (step.step === "registered") {
          transactionDigest = step.txDigest;
        }
      }
    });

    return {
      blobId: result.blobId,
      blobObjectId: result.blobObject.id,
      transactionDigest
    };
  }

  private async uploadViaPublisherHttp(bytes: Uint8Array): Promise<StoredWalrusBlob> {
    if (!this.config.publisherUrl) {
      throw new Error("WALRUS_PUBLISHER_URL is not set - HTTP publisher fallback unavailable.");
    }

    if (this.config.network === "mainnet") {
      throw new Error("The unauthenticated Walrus HTTP publisher fallback is testnet-only.");
    }

    const response = await fetch(
      `${trimTrailingSlash(this.config.publisherUrl)}/v1/blobs?epochs=${this.config.defaultEpochs}`,
      { method: "PUT", body: Buffer.from(bytes) }
    );

    if (!response.ok) {
      throw new Error(`Walrus publisher upload failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json() as {
      newlyCreated?: { blobObject?: { blobId?: string; id?: string } };
      alreadyCertified?: { blobId?: string; event?: { txDigest?: string } };
    };
    const blobId = payload.newlyCreated?.blobObject?.blobId ?? payload.alreadyCertified?.blobId;

    if (!blobId) {
      throw new Error(`Unexpected Walrus publisher response: ${JSON.stringify(payload)}`);
    }

    return {
      blobId,
      blobObjectId: payload.newlyCreated?.blobObject?.id ?? null,
      transactionDigest: payload.alreadyCertified?.event?.txDigest ?? null
    };
  }

  private unavailableProof(artifactId: string, contentHash: string, errorMessage: string) {
    return {
      ...buildPreparedStorageProof(artifactId, contentHash),
      status: "unavailable" as const,
      network: this.config.network,
      aggregatorUrl: this.config.aggregatorUrl,
      errorMessage
    };
  }
}

export function buildPreparedStorageProof(
  artifactId: string,
  contentHash: string
): AgentArtifactStorageProof {
  return {
    provider: "WALRUS",
    status: "prepared",
    contentHash,
    blobId: null,
    blobObjectId: null,
    transactionDigest: null,
    uri: `artifact://library/${artifactId}`,
    network: null,
    aggregatorUrl: null,
    uploadedAt: null,
    errorMessage: null
  };
}

export function hashArtifactContent(content: unknown) {
  return hashArtifactBytes(new TextEncoder().encode(JSON.stringify(content)));
}

function hashArtifactBytes(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : "Walrus storage upload failed";
}
