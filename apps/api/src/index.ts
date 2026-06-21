import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { config as loadEnv } from "dotenv";

import { buildApp } from "./app";
import { getApiConfig } from "./config";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const appPromise = (async () => {
  const config = getApiConfig();
  return buildApp(config);
})();

/** Vercel invokes this export once per HTTP request. */
export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const app = await appPromise;
  await app.ready();
  app.server.emit("request", request, response);
}

async function start() {
  const app = await appPromise;
  const config = getApiConfig();

  try {
    await app.listen({
      host: config.host,
      port: config.port
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

// A serverless runtime owns the socket. Calling listen() there causes the
// function invocation to hang or crash.
if (!process.env.VERCEL) {
  void start();
}
