import type { ApiHealthResponse } from "@dataloop/shared";
import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance) {
  const getHealth = async (): Promise<ApiHealthResponse> => {
    return {
      service: "api",
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0"
    };
  };

  app.get("/", getHealth);
  app.get("/healthz", getHealth);
}
