const DEFAULT_API_BASE_URL = "http://localhost:3001";

const WEEK1_TASK_ID = `0x${"a1".repeat(32)}`;
const WEEK1_DATASET_ID = `0x${"b2".repeat(32)}`;
const WEEK1_TASK_HASH = `0x${"c3".repeat(32)}`;
const WEEK1_CORRECTION_HASH = `0x${"d4".repeat(32)}`;
const WEEK1_DATASET_V1_HASH = `0x${"e5".repeat(32)}`;
const WEEK1_DATASET_V2_HASH = `0x${"f6".repeat(32)}`;

const CREATOR_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const SUBMITTER_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const REGISTRAR_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
  };
}

async function main() {
  const baseUrl = process.env.WEEK1_API_BASE_URL ?? DEFAULT_API_BASE_URL;

  console.log(`Seeding Week 1 flow against ${baseUrl}`);

  await post(`${baseUrl}/v1/tasks`, {
    taskId: WEEK1_TASK_ID,
    creatorAddress: CREATOR_ADDRESS,
    metadataUri: "ipfs://week1/fixture/task",
    metadataHash: WEEK1_TASK_HASH
  }, [201, 409]);

  const correctionResponse = await post(`${baseUrl}/v1/tasks/${WEEK1_TASK_ID}/corrections`, {
    submitterAddress: SUBMITTER_ADDRESS,
    metadataUri: "ipfs://week1/fixture/correction",
    metadataHash: WEEK1_CORRECTION_HASH
  }, [201]);

  const correctionId = correctionResponse.data.correction.correctionId as string;

  await post(`${baseUrl}/v1/datasets/${WEEK1_DATASET_ID}/versions`, {
    registeredBy: REGISTRAR_ADDRESS,
    metadataUri: "ipfs://week1/fixture/dataset-v1",
    metadataHash: WEEK1_DATASET_V1_HASH,
    entries: [
      { sourceType: "TASK", taskId: WEEK1_TASK_ID },
      { sourceType: "CORRECTION", correctionId }
    ]
  }, [201]);

  await post(`${baseUrl}/v1/datasets/${WEEK1_DATASET_ID}/versions`, {
    registeredBy: REGISTRAR_ADDRESS,
    metadataUri: "ipfs://week1/fixture/dataset-v2",
    metadataHash: WEEK1_DATASET_V2_HASH,
    immutableRef: "week1-fixture-dataset-v2",
    entries: [{ sourceType: "TASK", taskId: WEEK1_TASK_ID, metadataHash: WEEK1_DATASET_V2_HASH }]
  }, [201]);

  const latest = await get(`${baseUrl}/v1/datasets/${WEEK1_DATASET_ID}/latest`);

  console.log("Week 1 seed complete.");
  console.log(`Task ID: ${WEEK1_TASK_ID}`);
  console.log(`Dataset ID: ${WEEK1_DATASET_ID}`);
  console.log(`Latest dataset version: ${latest.data.version.versionNumber}`);
}

async function post(url: string, body: unknown, acceptedStatusCodes: number[]) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (acceptedStatusCodes.includes(response.status)) {
    return response.json();
  }

  await throwApiError(response);
}

async function get(url: string) {
  const response = await fetch(url);

  if (response.ok) {
    return response.json();
  }

  await throwApiError(response);
}

async function throwApiError(response: Response): Promise<never> {
  const fallbackMessage = `API request failed with status ${response.status}`;

  try {
    const payload = (await response.json()) as ApiErrorPayload;
    throw new Error(`${payload.error.code}: ${payload.error.message}`);
  } catch {
    throw new Error(fallbackMessage);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(message);
  process.exitCode = 1;
});
