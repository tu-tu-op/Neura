import type { FastifyInstance } from "fastify";
import type { AgentRuntimeService } from "../agent/runtime";

const objectBody = { type: "object", additionalProperties: true } as const;
const response = { type: "object", additionalProperties: true } as const;

export async function registerAgentPlatformRoutes(app: FastifyInstance, service: AgentRuntimeService) {
  app.get("/v1/agents", async () => ({ data: await service.listAgents() }));
  app.post<{ Body: Record<string, unknown> }>("/v1/agents", { schema: { body: objectBody, response: { 201: response } } }, async (request, reply) => reply.status(201).send({ data: await service.createAgent(request.body) }));
  app.get<{ Params: { agentId: string } }>("/v1/agents/:agentId", async (request) => ({ data: await service.getAgent(request.params.agentId) }));
  app.patch<{ Params: { agentId: string }; Body: Record<string, unknown> }>("/v1/agents/:agentId", { schema: { body: objectBody } }, async (request) => ({ data: await service.updateAgent(request.params.agentId, request.body) }));
  app.post<{ Params: { agentId: string }; Body: { input: string } }>("/v1/agents/:agentId/runs", { schema: { body: { type: "object", additionalProperties: false, required: ["input"], properties: { input: { type: "string", minLength: 1, maxLength: 20000 } } } } }, async (request, reply) => reply.status(201).send({ data: await service.runAgent(request.params.agentId, request.body.input) }));
  app.get<{ Params: { agentId: string; runId: string } }>("/v1/agents/:agentId/runs/:runId", async (request) => ({ data: await service.getRun(request.params.agentId, request.params.runId) }));

  app.get("/v1/artifacts", async () => ({ data: await service.listArtifacts() }));
  app.post<{ Body: Record<string, unknown> }>("/v1/artifacts", { schema: { body: objectBody, response: { 201: response } } }, async (request, reply) => reply.status(201).send({ data: await service.createArtifact(request.body) }));
  app.post<{ Params: { artifactId: string; version: string }; Body: Record<string, unknown> }>("/v1/artifacts/:artifactId/versions/:version/publication", { schema: { body: objectBody } }, async (request) => ({ data: await service.publishArtifact(request.params.artifactId, Number(request.params.version), request.body) }));
  app.post<{ Params: { runId: string }; Body: Record<string, unknown> }>("/v1/runs/:runId/feedback", { schema: { body: objectBody, response: { 201: response } } }, async (request, reply) => reply.status(201).send({ data: await service.addFeedback(request.params.runId, request.body) }));
}
