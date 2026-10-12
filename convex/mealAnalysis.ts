"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { decryptSecret } from "./lib/secrets";

const MAX_BASE64_LENGTH = 6_000_000;
const estimateValidator = v.object({
  name: v.string(),
  calories: v.number(),
  proteinGrams: v.number(),
  carbsGrams: v.number(),
  fatGrams: v.number(),
  confidence: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  items: v.array(v.string()),
  note: v.string(),
});

const estimateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "calories", "proteinGrams", "carbsGrams", "fatGrams", "confidence", "items", "note"],
  properties: {
    name: { type: "string", description: "Short, plain-language meal name" },
    calories: { type: "number", description: "Estimated total kilocalories" },
    proteinGrams: { type: "number" },
    carbsGrams: { type: "number" },
    fatGrams: { type: "number" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    items: { type: "array", items: { type: "string" }, maxItems: 12 },
    note: { type: "string", description: "One concise uncertainty note" },
  },
};

function clamp(value: unknown, minimum: number, maximum: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.round(Math.min(maximum, Math.max(minimum, number)) * 10) / 10;
}

function extractContent(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

function parseEstimate(content: string) {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value = JSON.parse(normalized) as Record<string, unknown>;
  return {
    name: typeof value.name === "string" ? value.name.slice(0, 100) : "Meal",
    calories: clamp(value.calories, 0, 5_000),
    proteinGrams: clamp(value.proteinGrams, 0, 500),
    carbsGrams: clamp(value.carbsGrams, 0, 800),
    fatGrams: clamp(value.fatGrams, 0, 500),
    confidence: ["low", "medium", "high"].includes(String(value.confidence)) ? value.confidence as "low" | "medium" | "high" : "low",
    items: Array.isArray(value.items) ? value.items.filter((item): item is string => typeof item === "string").slice(0, 12).map((item) => item.slice(0, 100)) : [],
    note: typeof value.note === "string" ? value.note.slice(0, 280) : "Portion sizes and hidden ingredients may change this estimate.",
  };
}

export const analyzeMeal = action({
  args: { imageBase64: v.string(), mimeType: v.union(v.literal("image/jpeg"), v.literal("image/png"), v.literal("image/webp")) },
  returns: estimateValidator,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in before analyzing a meal photo.");
    if (args.imageBase64.length > MAX_BASE64_LENGTH) throw new Error("That image is too large for a Convex analysis request.");

    const settings = await ctx.runQuery(internal.modelSettings.getProviderSecret, { userId });
    if (settings?.provider === "openrouter") {
      if (!settings.encryptedKey) throw new Error("Add an OpenRouter key in Settings before using OpenRouter.");
    } else if (!process.env.OPENAI_API_KEY) {
      throw new Error("The hosted OpenAI key is not configured. Choose OpenRouter and add your own key in Settings.");
    }

    const apiKey = settings?.provider === "openrouter" && settings.encryptedKey ? decryptSecret(settings.encryptedKey) : process.env.OPENAI_API_KEY!;
    const isOpenRouter = settings?.provider === "openrouter";
    const endpoint = isOpenRouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    if (isOpenRouter) {
      headers["HTTP-Referer"] = process.env.DAYFRAME_APP_ORIGIN || "https://dayframe.app";
      headers["X-Title"] = "Dayframe";
    }

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings?.model ?? "gpt-4o-mini",
        messages: [{ role: "user", content: [{ type: "text", text: "Estimate the total calories and macronutrients for everything intended to be eaten in this photo. Be conservative and explicit about uncertainty. If it is not a meal or is too unclear, use low confidence, zero values, and explain why. Do not give medical advice. Return only the requested JSON object." }, { type: "image_url", image_url: { url: `data:${args.mimeType};base64,${args.imageBase64}`, detail: "low" } }] }],
        ...(isOpenRouter ? { response_format: { type: "json_object" } } : { response_format: { type: "json_schema", json_schema: { name: "meal_estimate", strict: true, schema: estimateSchema } } }),
        max_tokens: 500,
      }),
    });
    if (!upstream.ok) throw new Error("The selected vision model could not analyze this photo right now.");
    const content = extractContent(await upstream.json());
    if (!content) throw new Error("The vision provider returned no meal estimate.");
    return parseEstimate(content);
  },
});
