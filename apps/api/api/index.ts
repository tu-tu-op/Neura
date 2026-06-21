// Vercel auto-discovers functions in api/. The implementation remains in src/
// so local development and serverless deployments use the same Fastify app.
export { default } from "../src/index";
