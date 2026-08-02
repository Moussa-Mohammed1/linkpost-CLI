import type { Detection } from "../../core/types.js";
import type { AnalyzerPlugin, PluginContext } from "../types.js";
import { detect, uniqByName } from "./util.js";

const AI_STACKS: Array<{ name: string; modules: string[]; files?: string[]; confidence?: number }> = [
  { name: "OpenAI SDK", modules: ["openai", "@openai/*"], confidence: 0.92 },
  { name: "Anthropic SDK", modules: ["@anthropic-ai/sdk"], confidence: 0.92 },
  { name: "Google Gemini", modules: ["@google/generative-ai"], confidence: 0.88 },
  { name: "LangChain", modules: ["langchain", "@langchain/core", "langgraph"], confidence: 0.9 },
  { name: "LlamaIndex", modules: ["llama-index", "@llamaindex/core"], confidence: 0.85 },
  { name: "Transformers", modules: ["transformers", "@huggingface/transformers"], confidence: 0.85 },
  { name: "Hugging Face Hub", modules: ["@huggingface/hub", "datasets"], confidence: 0.75 },
  { name: "PyTorch", modules: ["torch", "torchvision", "torchaudio"], confidence: 0.92 },
  { name: "TensorFlow", modules: ["tensorflow", "@tensorflow/tfjs"], confidence: 0.9 },
  { name: "scikit-learn", modules: ["scikit-learn", "sklearn"], confidence: 0.9 },
  { name: "Ollama", modules: ["ollama", "@ollama/*"], confidence: 0.8 },
  { name: "Cohere", modules: ["cohere"], confidence: 0.8 },
{ name: "Replicate", modules: ["replicate"], confidence: 0.7 },
  { name: "Embeddings", modules: ["tiktoken", "sentence-transformers", "@xenova/transformers"], confidence: 0.75 },
  { name: "Unstructured/OCR", modules: ["pdf-parse", "unstructured"], confidence: 0.6 },
];

export const aiPlugin: AnalyzerPlugin = {
  id: "builtin.ai",
  title: "AI Libraries",
  description: "Detects AI/ML and LLM libraries.",
  detect(ctx: PluginContext): Detection[] {
    const out: Detection[] = [];
    for (const stack of AI_STACKS) {
      const hit = stack.modules.find((m) => ctx.hasModule(m));
      if (hit) {
        out.push(detect(stack.name, "ai", stack.confidence ?? 0.85, undefined, hit));
      }
    }
    if (ctx.hasExtension("pkl") || ctx.hasGlob("**/*.onnx") || ctx.hasGlob("**/*.pt")) {
      out.push(detect("Trained Models", "ai", 0.6, "model artifacts", "*.onnx / *.pt"));
    }
    return uniqByName(out);
  },
};