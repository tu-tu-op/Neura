import type { FastifyInstance } from "fastify";

import type { AgentService } from "../agent/service";
import type { AgentCompareRequest, AgentUploadArtifactRequest } from "../agent/types";
import {
  addAgentArtifactToLibrarySchema,
  compareAgentQuestionSchema,
  listAgentArtifactsSchema,
  removeAgentArtifactFromLibrarySchema,
  uploadAgentArtifactSchema
} from "./agent.schemas";

export async function registerAgentRoutes(app: FastifyInstance, agentService: AgentService) {
  app.get(
    "/v1/agent/marketplace/artifacts",
    {
      schema: listAgentArtifactsSchema
    },
    async () => ({
      data: {
        artifacts: agentService.listMarketplaceArtifacts()
      }
    })
  );

  app.get(
    "/v1/agent/library",
    {
      schema: listAgentArtifactsSchema
    },
    async () => ({
      data: {
        artifacts: agentService.listLibraryArtifacts()
      }
    })
  );

  app.post<{ Body: { artifactId: string } }>(
    "/v1/agent/library/artifacts",
    {
      schema: addAgentArtifactToLibrarySchema
    },
    async (request) => ({
      data: agentService.addArtifactToLibrary(request.body.artifactId)
    })
  );

  app.delete<{ Params: { artifactId: string } }>(
    "/v1/agent/library/artifacts/:artifactId",
    {
      schema: removeAgentArtifactFromLibrarySchema
    },
    async (request) => ({
      data: agentService.removeArtifactFromLibrary(request.params.artifactId)
    })
  );

  app.post<{ Body: AgentUploadArtifactRequest }>(
    "/v1/agent/artifacts/upload",
    {
      schema: uploadAgentArtifactSchema
    },
    async (request, reply) => {
      const result = await agentService.uploadArtifact(request.body);
      return reply.status(201).send({ data: result });
    }
  );

  app.post<{ Body: AgentCompareRequest }>(
    "/v1/agent/compare",
    {
      schema: compareAgentQuestionSchema
    },
    async (request) => ({
      data: await agentService.compare(request.body)
    })
  );
}
