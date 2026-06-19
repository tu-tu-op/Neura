const addressSchema = {
  type: "string",
  pattern: "^0x[a-fA-F0-9]{40}$"
} as const;

const bytes32Schema = {
  type: "string",
  pattern: "^0x[a-fA-F0-9]{64}$"
} as const;

const numericStringSchema = {
  type: "string",
  pattern: "^(0|[1-9][0-9]*)$"
} as const;

const optionalNonEmptyStringSchema = {
  type: "string",
  minLength: 1
} as const;

const chainReferenceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["chainId", "contractAddress", "transactionHash", "blockNumber", "logIndex"],
  properties: {
    chainId: { type: ["integer", "null"] },
    contractAddress: { type: ["string", "null"] },
    transactionHash: { type: ["string", "null"] },
    blockNumber: { type: ["string", "null"] },
    logIndex: { type: ["integer", "null"] }
  }
} as const;

export const errorResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {}
      }
    }
  }
} as const;

const taskSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "storageId",
    "taskId",
    "creatorAddress",
    "chainCreatorAddress",
    "createdAt",
    "metadataUri",
    "metadataHash",
    "chain"
  ],
  properties: {
    storageId: { type: "string" },
    taskId: bytes32Schema,
    creatorAddress: addressSchema,
    chainCreatorAddress: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
    metadataUri: { type: ["string", "null"] },
    metadataHash: { type: ["string", "null"] },
    chain: chainReferenceSchema
  }
} as const;

const correctionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "storageId",
    "correctionId",
    "taskId",
    "submitterAddress",
    "chainSubmitterAddress",
    "submittedAt",
    "metadataUri",
    "metadataHash",
    "chain"
  ],
  properties: {
    storageId: { type: "string" },
    correctionId: numericStringSchema,
    taskId: bytes32Schema,
    submitterAddress: addressSchema,
    chainSubmitterAddress: { type: ["string", "null"] },
    submittedAt: { type: "string", format: "date-time" },
    metadataUri: { type: ["string", "null"] },
    metadataHash: { type: ["string", "null"] },
    chain: chainReferenceSchema
  }
} as const;

const datasetEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "datasetVersionId",
    "sourceType",
    "position",
    "taskId",
    "correctionId",
    "metadataUri",
    "metadataHash",
    "insertedAt"
  ],
  properties: {
    id: { type: "string" },
    datasetVersionId: { type: "string" },
    sourceType: { type: "string", enum: ["TASK", "CORRECTION"] },
    position: { type: "integer" },
    taskId: { type: ["string", "null"] },
    correctionId: { type: ["string", "null"] },
    metadataUri: { type: ["string", "null"] },
    metadataHash: { type: ["string", "null"] },
    insertedAt: { type: "string", format: "date-time" }
  }
} as const;

const datasetSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "storageId",
    "datasetId",
    "createdBy",
    "createdAt",
    "metadataUri",
    "metadataHash",
    "latestVersionNumber"
  ],
  properties: {
    storageId: { type: "string" },
    datasetId: bytes32Schema,
    createdBy: addressSchema,
    createdAt: { type: "string", format: "date-time" },
    metadataUri: { type: ["string", "null"] },
    metadataHash: { type: ["string", "null"] },
    latestVersionNumber: { type: "integer" }
  }
} as const;

const datasetVersionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "storageId",
    "datasetId",
    "versionNumber",
    "registeredBy",
    "chainRegistrarAddress",
    "registeredAt",
    "metadataUri",
    "metadataHash",
    "immutableRef",
    "entries",
    "chain"
  ],
  properties: {
    storageId: { type: "string" },
    datasetId: bytes32Schema,
    versionNumber: { type: "integer" },
    registeredBy: addressSchema,
    chainRegistrarAddress: { type: ["string", "null"] },
    registeredAt: { type: "string", format: "date-time" },
    metadataUri: { type: ["string", "null"] },
    metadataHash: { type: ["string", "null"] },
    immutableRef: { type: "string" },
    entries: {
      type: "array",
      items: datasetEntrySchema
    },
    chain: chainReferenceSchema
  }
} as const;

export const createTaskSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["taskId", "creatorAddress"],
    properties: {
      taskId: bytes32Schema,
      creatorAddress: addressSchema,
      metadataUri: optionalNonEmptyStringSchema,
      metadataHash: bytes32Schema,
      stakeAmountWei: numericStringSchema
    },
    anyOf: [{ required: ["metadataUri"] }, { required: ["metadataHash"] }]
  },
  response: {
    201: {
      type: "object",
      additionalProperties: false,
      required: ["data"],
      properties: {
        data: {
          type: "object",
          additionalProperties: false,
          required: ["task", "contractTaskId", "stakeId"],
          properties: {
            task: taskSchema,
            contractTaskId: bytes32Schema,
            stakeId: { type: ["string", "null"] }
          }
        }
      }
    },
    400: errorResponseSchema,
    409: errorResponseSchema,
    502: errorResponseSchema
  }
} as const;

export const submitCorrectionSchema = {
  params: {
    type: "object",
    additionalProperties: false,
    required: ["taskId"],
    properties: {
      taskId: bytes32Schema
    }
  },
  body: {
    type: "object",
    additionalProperties: false,
    required: ["submitterAddress"],
    properties: {
      submitterAddress: addressSchema,
      metadataUri: optionalNonEmptyStringSchema,
      metadataHash: bytes32Schema,
      stakeAmountWei: numericStringSchema
    },
    anyOf: [{ required: ["metadataUri"] }, { required: ["metadataHash"] }]
  },
  response: {
    201: {
      type: "object",
      additionalProperties: false,
      required: ["data"],
      properties: {
        data: {
          type: "object",
          additionalProperties: false,
          required: ["correction", "stakeId"],
          properties: {
            correction: correctionSchema,
            stakeId: { type: ["string", "null"] }
          }
        }
      }
    },
    400: errorResponseSchema,
    404: errorResponseSchema,
    502: errorResponseSchema
  }
} as const;

export const registerDatasetVersionSchema = {
  params: {
    type: "object",
    additionalProperties: false,
    required: ["datasetId"],
    properties: {
      datasetId: bytes32Schema
    }
  },
  body: {
    type: "object",
    additionalProperties: false,
    required: ["registeredBy", "entries"],
    properties: {
      registeredBy: addressSchema,
      metadataUri: optionalNonEmptyStringSchema,
      metadataHash: bytes32Schema,
      immutableRef: optionalNonEmptyStringSchema,
      entries: {
        type: "array",
        minItems: 1,
        items: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["sourceType", "taskId"],
              properties: {
                sourceType: { type: "string", const: "TASK" },
                taskId: bytes32Schema,
                metadataUri: optionalNonEmptyStringSchema,
                metadataHash: bytes32Schema
              }
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["sourceType", "correctionId"],
              properties: {
                sourceType: { type: "string", const: "CORRECTION" },
                correctionId: numericStringSchema,
                metadataUri: optionalNonEmptyStringSchema,
                metadataHash: bytes32Schema
              }
            }
          ]
        }
      }
    },
    anyOf: [{ required: ["metadataUri"] }, { required: ["metadataHash"] }]
  },
  response: {
    201: {
      type: "object",
      additionalProperties: false,
      required: ["data"],
      properties: {
        data: {
          type: "object",
          additionalProperties: false,
          required: ["dataset", "version"],
          properties: {
            dataset: datasetSummarySchema,
            version: datasetVersionSchema
          }
        }
      }
    },
    400: errorResponseSchema,
    404: errorResponseSchema,
    502: errorResponseSchema
  }
} as const;

export const taskParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["taskId"],
  properties: {
    taskId: bytes32Schema
  }
} as const;

export const datasetParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["datasetId"],
  properties: {
    datasetId: bytes32Schema
  }
} as const;

export const getTaskResponseSchema = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["data"],
    properties: {
      data: taskSchema
    }
  },
  400: errorResponseSchema,
  404: errorResponseSchema
} as const;

export const getCorrectionsResponseSchema = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["data"],
    properties: {
      data: {
        type: "object",
        additionalProperties: false,
        required: ["task", "corrections"],
        properties: {
          task: taskSchema,
          corrections: {
            type: "array",
            items: correctionSchema
          }
        }
      }
    }
  },
  400: errorResponseSchema,
  404: errorResponseSchema
} as const;

export const getDatasetHistoryResponseSchema = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["data"],
    properties: {
      data: {
        type: "object",
        additionalProperties: false,
        required: ["dataset", "versions"],
        properties: {
          dataset: datasetSummarySchema,
          versions: {
            type: "array",
            items: datasetVersionSchema
          }
        }
      }
    }
  },
  400: errorResponseSchema,
  404: errorResponseSchema
} as const;

export const getLatestDatasetVersionResponseSchema = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["data"],
    properties: {
      data: {
        type: "object",
        additionalProperties: false,
        required: ["dataset", "version"],
        properties: {
          dataset: datasetSummarySchema,
          version: datasetVersionSchema
        }
      }
    }
  },
  400: errorResponseSchema,
  404: errorResponseSchema
} as const;
