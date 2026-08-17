import { buildApp } from "./app.js";
import { getConfig } from "./config.js";

const config = getConfig();
const app = buildApp();

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}
