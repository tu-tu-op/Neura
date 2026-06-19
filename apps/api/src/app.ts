import cors from "@fastify/cors";
import Fastify from "fastify";

import { ApiError } from "./errors";
import { createAgentService, type AgentService } from "./agent/service";
import { createBasePlatformService, type BasePlatformService } from "./platform/service";
import type { ApiConfig } from "./config";
import { registerAgentRoutes } from "./routes/agent";
import { registerBasePlatformRoutes } from "./routes/base-platform";
import { registerHealthRoutes } from "./routes/health";

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

  const platformService = dependencies.platformService ?? createBasePlatformService(config);
  const agentService = dependencies.agentService ?? createAgentService(config.agent);

  await registerHealthRoutes(app);
  await registerBasePlatformRoutes(app, platformService);
  await registerAgentRoutes(app, agentService);

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
