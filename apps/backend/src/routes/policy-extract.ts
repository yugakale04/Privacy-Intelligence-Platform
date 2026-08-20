import type { FastifyInstance } from "fastify";
import { extractPolicy, PolicyExtractionError } from "../services/policy-extractor.js";
import { PolicyProcessingError, processPolicy } from "../services/policy-processor.js";

interface PolicyExtractBody { policyUrl: string; }

const policyExtractBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["policyUrl"],
  properties: { policyUrl: { type: "string", minLength: 1, maxLength: 2_048, format: "uri" } }
} as const;

function extractionErrorStatus(code: PolicyExtractionError["code"]): number {
  if (code === "INVALID_URL" || code === "UNSUPPORTED_CONTENT_TYPE" || code === "INSUFFICIENT_CONTENT") return 400;
  if (code === "TIMEOUT") return 504;
  if (code === "HTTP_ERROR") return 502;
  return 502;
}

export async function registerPolicyExtractRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: PolicyExtractBody }>("/api/v1/policy/extract", { schema: { body: policyExtractBodySchema } }, async (request, reply) => {
    try {
      const policy = await extractPolicy(request.body.policyUrl);
      const structuredPolicy = processPolicy(policy);
      return { success: true, policy, structuredPolicy };
    } catch (error) {
      if (error instanceof PolicyExtractionError) {
        return reply.status(extractionErrorStatus(error.code)).send({ success: false, error: { code: error.code, message: error.message } });
      }
      if (error instanceof PolicyProcessingError) {
        return reply.status(400).send({ success: false, error: { code: "INSUFFICIENT_CONTENT", message: error.message } });
      }
      throw error;
    }
  });
}
