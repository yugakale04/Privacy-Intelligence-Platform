import type { FastifyInstance } from "fastify";

interface PageInfoBody {
  title: string;
  url: string;
  hostname: string;
  hasReadableText: boolean;
}

const pageInfoBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "url", "hostname", "hasReadableText"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 500 },
    url: { type: "string", minLength: 1, maxLength: 2_048, format: "uri" },
    hostname: { type: "string", minLength: 1, maxLength: 253 },
    hasReadableText: { type: "boolean" }
  }
} as const;

export async function registerPageInfoRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: PageInfoBody }>("/api/v1/page-info", {
    schema: { body: pageInfoBodySchema }
  }, async (request) => ({
    status: "ok",
    hostname: request.body.hostname,
    message: "Page information received."
  }));
}
