import type { ApiHealthResponse } from "@dataloop/shared";
import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/healthz", async (): Promise<ApiHealthResponse> => {
    return {
      service: "api",
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0"
    };
  });
}
