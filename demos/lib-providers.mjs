import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { envApiKeyAuth } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";

export const MODEL_ID = "qwen3.8-flash";
export const CHAT_BASE = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";

const modelFields = (provider, api, baseUrl) => ({
  id: MODEL_ID,
  name: MODEL_ID,
  api,
  provider,
  baseUrl,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 8192,
});

/** @param {"chat"|"faux"} which */
export function buildModels(which = "chat") {
  const models = createModels();
  if (which === "faux") {
    const faux = fauxProvider();
    models.setProvider(faux.provider);
    return { models, provider: "faux", modelId: "faux", faux };
  }
  if (!process.env.PI_DURABLE_CHAT_API_KEY) {
    throw new Error("PI_DURABLE_CHAT_API_KEY is required for chat stack (value never logged)");
  }
  models.setProvider(createProvider({
    id: "aliyun-chat",
    name: "Aliyun Chat",
    auth: { apiKey: envApiKeyAuth("Aliyun chat", ["PI_DURABLE_CHAT_API_KEY"]) },
    baseUrl: CHAT_BASE,
    models: [modelFields("aliyun-chat", "openai-completions", CHAT_BASE)],
    api: openAICompletionsApi(),
  }));
  return { models, provider: "aliyun-chat", modelId: MODEL_ID, faux: null };
}

export { fauxAssistantMessage, fauxToolCall };
