import { errorResponseSchema } from "./base-platform.schemas";

const artifactIdParamSchema = {
  type: "object",
  additionalProperties: false,
  required: ["artifactId"],
  properties: {
    artifactId: { type: "string", minLength: 1 }
  }
} as const;

export const listAgentArtifactsSchema = {
  response: {
    200: {
      type: "object",
      additionalProperties: true
    }
  }
} as const;

export const addAgentArtifactToLibrarySchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["artifactId"],
    properties: {
      artifactId: { type: "string", minLength: 1 }
    }
  },
  response: {
    200: {
      type: "object",
      additionalProperties: true
    },
    400: errorResponseSchema,
    404: errorResponseSchema
  }
} as const;

export const removeAgentArtifactFromLibrarySchema = {
  params: artifactIdParamSchema,
  response: {
    200: {
      type: "object",
      additionalProperties: true
    },
    400: errorResponseSchema,
    404: errorResponseSchema
  }
} as const;

export const uploadAgentArtifactSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["title", "answer"],
    properties: {
      title: { type: "string", minLength: 1 },
      questionPattern: { type: "string" },
      formulaPattern: { type: "string" },
      concepts: {
        type: "array",
        items: { type: "string" },
        maxItems: 12
      },
      answer: { type: "string", minLength: 1 }
    }
  },
  response: {
    201: {
      type: "object",
      additionalProperties: true
    },
    400: errorResponseSchema
  }
} as const;

export const compareAgentQuestionSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["question"],
    properties: {
      question: { type: "string", minLength: 1 }
    }
  },
  response: {
    200: {
      type: "object",
      additionalProperties: true
    },
    400: errorResponseSchema
  }
} as const;
