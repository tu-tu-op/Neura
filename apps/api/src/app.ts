import cors from "@fastify/cors";
import Fastify from "fastify";

import { ApiError } from "./errors";
import { createAgentService, type AgentService } from "./agent/service";
import { createBasePlatformService, type BasePlatformService } from "./platform/service";
import type { ApiConfig } from "./config";
import { registerAgentRoutes } from "./routes/agent";
import { registerBasePlatformRoutes } from "./routes/base-platform";
import { registerHealthRoutes } from "./routes/health";
import { AgentRuntimeService } from "./agent/runtime";
import { registerAgentPlatformRoutes } from "./routes/agents";

export interface AppDependencies {
  platformService?: BasePlatformService;
  agentService?: AgentService;
}

export async function buildApp(config: ApiConfig, dependencies: AppDependencies = {}) {
  const app = Fastify({
    logger: config.nodeEnv !== "test"
  });

  await app.register(cors, {
    origin: config.webOrigin
  });

  const agentService = dependencies.agentService ?? createAgentService(config.agent);

  await registerHealthRoutes(app);
  const platformService = dependencies.platformService ?? (config.blockchain.signerPrivateKey ? createBasePlatformService(config) : null);
  if (platformService) await registerBasePlatformRoutes(app, platformService);
  await registerAgentRoutes(app, agentService);
  await registerAgentPlatformRoutes(app, new AgentRuntimeService(config.agent));

  app.setErrorHandler((error, _request, reply) => {
    if (typeof error === "object" && error !== null && "validation" in error) {
      const validationError = error as { validation: unknown };

      return reply.status(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "Request validation failed",
          details: validationError.validation
        }
      });
    }

    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    }

    app.log.error(error);

    return reply.status(500).send({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error"
      }
    });
  });

  return app;
}
