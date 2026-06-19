import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

import { buildApp } from "./app";
import { getApiConfig } from "./config";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

async function start() {
  const config = getApiConfig();
  const app = await buildApp(config);

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

void start();
