import Fastify, { type FastifyInstance } from "fastify";
import { registerPageInfoRoute } from "./routes/page-info.js";

function isValidationError(error: unknown): error is { validation: unknown } {
  return Boolean(error && typeof error === "object" && "validation" in error && (error as { validation?: unknown }).validation);
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    service: "privacy-intelligence-backend"
  }));

  void app.register(registerPageInfoRoute);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    if (isValidationError(error)) {
      return reply.status(400).send({
        error: "validation_error",
        message: "Invalid page information request."
      });
    }
    return reply.status(500).send({
      error: "internal_server_error",
      message: "An unexpected server error occurred."
    });
  });

  return app;
}
