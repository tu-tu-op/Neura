import { useCallback } from "react";
import { useSignAndExecuteTransaction, useSuiClient, useSuiClientQuery } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

import { useNetworkVariable } from "./network-config";
import { ARTIFACT_REGISTRY_ID, SUI_PACKAGE_ID } from "./package-config";

export interface CreateArtifactInput {
  artifactId?: string;
  metadataUri: string;
  metadataHash: Uint8Array;
  storageUri: string;
  storageHash: Uint8Array;
}

export function useCreateArtifact() {
  const networkPackageId = useNetworkVariable("packageId");
  const packageId = networkPackageId || SUI_PACKAGE_ID;
  const client = useSuiClient();
  const transactionMutation = useSignAndExecuteTransaction();

  const createArtifact = useCallback(
    async ({ artifactId, metadataUri, metadataHash, storageUri, storageHash }: CreateArtifactInput) => {
      if (!packageId || !ARTIFACT_REGISTRY_ID) {
        throw new Error("Sui package and artifact registry IDs must be configured before publishing.");
      }

      const transaction = new Transaction();
      if (artifactId) {
        transaction.moveCall({
          target: `${packageId}::artifact_registry::create_neon_artifact`,
          arguments: [transaction.pure.string(artifactId), transaction.pure.vector("u8", Array.from(metadataHash)), transaction.object(ARTIFACT_REGISTRY_ID)]
        });
      } else transaction.moveCall({
        target: `${packageId}::artifact_registry::create_artifact`,
        arguments: [
          transaction.pure.string(metadataUri),
          transaction.pure.vector("u8", Array.from(metadataHash)),
          transaction.pure.string(storageUri),
          transaction.pure.vector("u8", Array.from(storageHash)),
          transaction.object(ARTIFACT_REGISTRY_ID)
        ]
      });

      const result = await transactionMutation.mutateAsync({ transaction });
      const confirmed = await client.waitForTransaction({
        digest: result.digest,
        options: { showObjectChanges: true }
      });
      const createdArtifact = confirmed.objectChanges?.find(
        (change) =>
          change.type === "created" &&
          change.objectType.includes(`${packageId}::artifact_registry::Artifact`)
      );

      if (!createdArtifact || createdArtifact.type !== "created") {
        throw new Error("The transaction completed, but its created Artifact object was not returned.");
      }

      return createdArtifact.objectId;
    },
    [client, packageId, transactionMutation]
  );

  return {
    createArtifact,
    isConfigured: Boolean(packageId && ARTIFACT_REGISTRY_ID),
    isPending: transactionMutation.isPending,
    isError: transactionMutation.isError,
    error: transactionMutation.error
  };
}

export function useArtifact(objectId: string) {
  return useSuiClientQuery(
    "getObject",
    {
      id: objectId,
      options: { showContent: true }
    },
    {
      enabled: objectId.length > 0
    }
  );
}

export async function sha256Bytes(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}
