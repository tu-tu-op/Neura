import type {
  AgentArtifactManifest,
  AgentCorrectionRecord,
  AgentFailureRecord
} from "@dataloop/shared";

import type { AgentConfig } from "./config";
import { sha256Hex } from "./hash";

export interface PublishedPlatformRecord {
  benchmarkCaseId: string;
  taskId: string;
  correctionId: string | null;
}

export interface PublishResult {
  publishedTaskCount: number;
  publishedCorrectionCount: number;
  registeredDatasetVersion: boolean;
  records: PublishedPlatformRecord[];
  errors: string[];
}

export interface PublishArtifactsContext {
  artifactManifest: AgentArtifactManifest[];
}

export async function publishFailuresToPlatform(
  config: AgentConfig,
  runId: string,
  suiteLabel: string,
  failures: AgentFailureRecord[],
  corrections: AgentCorrectionRecord[],
  publishArtifacts: PublishArtifactsContext
): Promise<PublishResult> {
  if (!config.pushToPlatform && !config.registerDatasetVersion) {
    return {
      publishedTaskCount: 0,
      publishedCorrectionCount: 0,
      registeredDatasetVersion: false,
      records: [],
      errors: []
    };
  }

  if (config.platformApiUrl === null) {
    throw new Error("AGENT_PLATFORM_API_URL is required for platform publishing");
  }

  const correctionsByCaseId = new Map(corrections.map((entry) => [entry.benchmarkCaseId, entry]));
  const records: PublishedPlatformRecord[] = [];
  const errors: string[] = [];
  const datasetEntries: Array<
    | { sourceType: "TASK"; taskId: string }
    | { sourceType: "CORRECTION"; correctionId: string }
  > = [];

  for (const failure of failures) {
    const taskId = sha256Hex(`task:${runId}:${failure.benchmarkCase.id}`);
    const relatedArtifacts = publishArtifacts.artifactManifest.filter(
      (artifact) => artifact.benchmarkCaseId === failure.benchmarkCase.id
    );
    const failureMetadata = JSON.stringify(
      {
        failure,
        relatedArtifacts
      },
      null,
      2
    );

    try {
      await postJson(`${config.platformApiUrl}/v1/tasks`, {
        taskId,
        creatorAddress: config.platformCreatorAddress,
        metadataUri: toArtifactUri(runId, `${failure.benchmarkCase.id}.failure.json`),
        metadataHash: sha256Hex(failureMetadata)
      });

      datasetEntries.push({ sourceType: "TASK", taskId });
    } catch (error) {
      errors.push(formatError(`task publish failed for ${failure.benchmarkCase.id}`, error));
      continue;
    }

    let correctionId: string | null = null;
    const correction = correctionsByCaseId.get(failure.benchmarkCase.id);

    if (correction !== undefined) {
      const correctionMetadata = JSON.stringify(
        {
          correction,
          relatedArtifacts
        },
        null,
        2
      );

      try {
        const result = await postJson<{
          correction: {
            correctionId: string;
          };
        }>(`${config.platformApiUrl}/v1/tasks/${taskId}/corrections`, {
          submitterAddress: config.platformSubmitterAddress,
          metadataUri: toArtifactUri(runId, `${failure.benchmarkCase.id}.correction.json`),
          metadataHash: sha256Hex(correctionMetadata)
        });

        correctionId = result.correction.correctionId;
        datasetEntries.push({ sourceType: "CORRECTION", correctionId });
      } catch (error) {
        errors.push(formatError(`correction publish failed for ${failure.benchmarkCase.id}`, error));
      }
    }

    records.push({
      benchmarkCaseId: failure.benchmarkCase.id,
      taskId,
      correctionId
    });
  }

  let registeredDatasetVersion = false;

  if (config.registerDatasetVersion && datasetEntries.length > 0) {
    const datasetId = config.platformDatasetId ?? sha256Hex(`dataset:${suiteLabel}`);
    const manifest = {
      runId,
      suiteLabel,
      entryCount: datasetEntries.length,
      artifactCount: publishArtifacts.artifactManifest.length,
      artifactManifest: publishArtifacts.artifactManifest
    };

    try {
      await postJson(`${config.platformApiUrl}/v1/datasets/${datasetId}/versions`, {
        registeredBy: config.platformRegistrarAddress,
        metadataUri: toArtifactUri(runId, "run-report.json"),
        metadataHash: sha256Hex(JSON.stringify(manifest)),
        immutableRef: `agent-run:${runId}`,
        entries: datasetEntries
      });
      registeredDatasetVersion = true;
    } catch (error) {
      errors.push(formatError("dataset registration failed", error));
    }
  }

  return {
    publishedTaskCount: records.length,
    publishedCorrectionCount: records.filter((record) => record.correctionId !== null).length,
    registeredDatasetVersion,
    records,
    errors
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as { data?: T; error?: { message?: string; code?: string } };

  if (!response.ok) {
    const message = payload.error?.message ?? `request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (payload.data === undefined) {
    throw new Error("response payload did not include data");
  }

  return payload.data;
}

function toArtifactUri(runId: string, fileName: string) {
  return `artifact://agent-runs/${runId}/${fileName}`;
}

function formatError(prefix: string, error: unknown) {
  return `${prefix}: ${error instanceof Error ? error.message : "unexpected error"}`;
}
