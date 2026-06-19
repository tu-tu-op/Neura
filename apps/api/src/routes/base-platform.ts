import type { FastifyInstance } from "fastify";

import type { BasePlatformService } from "../platform/service";
import type {
  CreateTaskRequest,
  RegisterDatasetVersionRequest,
  SubmitCorrectionRequest
} from "../platform/types";
import {
  createTaskSchema,
  datasetParamsSchema,
  getCorrectionsResponseSchema,
  getDatasetHistoryResponseSchema,
  getLatestDatasetVersionResponseSchema,
  getTaskResponseSchema,
  registerDatasetVersionSchema,
  submitCorrectionSchema,
  taskParamsSchema
} from "./base-platform.schemas";

export async function registerBasePlatformRoutes(
  app: FastifyInstance,
  platformService: BasePlatformService
) {
  app.post<{ Body: CreateTaskRequest }>(
    "/v1/tasks",
    {
      schema: createTaskSchema
    },
    async (request, reply) => {
      const result = await platformService.createTask(request.body);
      return reply.status(201).send({ data: result });
    }
  );

  app.post<{ Params: { taskId: string }; Body: SubmitCorrectionRequest }>(
    "/v1/tasks/:taskId/corrections",
    {
      schema: submitCorrectionSchema
    },
    async (request, reply) => {
      const result = await platformService.submitCorrection(request.params.taskId, request.body);
      return reply.status(201).send({ data: result });
    }
  );

  app.post<{ Params: { datasetId: string }; Body: RegisterDatasetVersionRequest }>(
    "/v1/datasets/:datasetId/versions",
    {
      schema: registerDatasetVersionSchema
    },
    async (request, reply) => {
      const result = await platformService.registerDatasetVersion(
        request.params.datasetId,
        request.body
      );
      return reply.status(201).send({ data: result });
    }
  );

  app.get<{ Params: { taskId: string } }>(
    "/v1/tasks/:taskId",
    {
      schema: {
        params: taskParamsSchema,
        response: getTaskResponseSchema
      }
    },
    async (request) => {
      const result = await platformService.getTask(request.params.taskId);
      return { data: result };
    }
  );

  app.get<{ Params: { taskId: string } }>(
    "/v1/tasks/:taskId/corrections",
    {
      schema: {
        params: taskParamsSchema,
        response: getCorrectionsResponseSchema
      }
    },
    async (request) => {
      const result = await platformService.getCorrectionsForTask(request.params.taskId);
      return { data: result };
    }
  );

  app.get<{ Params: { datasetId: string } }>(
    "/v1/datasets/:datasetId/history",
    {
      schema: {
        params: datasetParamsSchema,
        response: getDatasetHistoryResponseSchema
      }
    },
    async (request) => {
      const result = await platformService.getDatasetHistory(request.params.datasetId);
      return { data: result };
    }
  );

  app.get<{ Params: { datasetId: string } }>(
    "/v1/datasets/:datasetId/latest",
    {
      schema: {
        params: datasetParamsSchema,
        response: getLatestDatasetVersionResponseSchema
      }
    },
    async (request) => {
      const result = await platformService.getLatestDatasetVersion(request.params.datasetId);
      return { data: result };
    }
  );
}
