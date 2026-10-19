import type { FastifyInstance } from "fastify";
import { extractPolicy, PolicyExtractionError } from "../services/policy-extractor.js";
import { PolicyProcessingError, processPolicy } from "../services/policy-processor.js";
import { PolicyStorageError, PolicyStore } from "../services/policy-store.js";

interface PolicyExtractBody { policyUrl: string; }

interface PolicyExtractRouteOptions {
  policyStore?: PolicyStore;
  extractPolicyImpl?: typeof extractPolicy;
}

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

export async function registerPolicyExtractRoute(app: FastifyInstance, options: PolicyExtractRouteOptions = {}): Promise<void> {
  const policyStore = options.policyStore || new PolicyStore();
  const extractPolicyImpl = options.extractPolicyImpl || extractPolicy;

  app.post<{ Body: PolicyExtractBody }>("/api/v1/policy/extract", { schema: { body: policyExtractBodySchema } }, async (request, reply) => {
    try {
      const policy = await extractPolicyImpl(request.body.policyUrl);
      const structuredPolicy = processPolicy(policy);
      try {
        await policyStore.save(policy);
      } catch (error) {
        if (!(error instanceof PolicyStorageError)) throw error;
        request.log.error({ code: error.code }, "Unable to persist extracted policy.");
        return reply.status(503).send({ success: false, error: { code: error.code, message: error.message } });
      }
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

  app.get<{ Params: { policyId: string } }>("/api/v1/policy/:policyId", {
    schema: { params: { type: "object", required: ["policyId"], properties: { policyId: { type: "string", pattern: "^[a-f0-9]{64}$" } } } }
  }, async (request, reply) => {
    try {
      const storedPolicy = await policyStore.get(request.params.policyId);
      return { success: true, storedPolicy };
    } catch (error) {
      if (error instanceof PolicyStorageError) {
        const status = error.code === "POLICY_NOT_FOUND" ? 404 : error.code === "INVALID_POLICY" ? 400 : 503;
        return reply.status(status).send({ success: false, error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });
}
