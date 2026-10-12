import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

const providers = v.union(v.literal("openai"), v.literal("openrouter"));
const publicSettings = v.object({
  provider: providers,
  model: v.string(),
  openRouterKeyLast4: v.union(v.string(), v.null()),
  openRouterConfigured: v.boolean(),
  catalog: v.array(v.object({ provider: providers, model: v.string(), label: v.string(), description: v.string() })),
});

export const MODEL_CATALOG = [
  { provider: "openrouter" as const, model: "openrouter/free", label: "Free Models Router", description: "Free vision models with structured JSON routing" },
  { provider: "openrouter" as const, model: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B (free)", description: "Free multimodal model with structured outputs" },
  { provider: "openrouter" as const, model: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (free)", description: "Free multimodal model for meal understanding" },
  { provider: "openrouter" as const, model: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Fast OpenRouter vision model" },
  { provider: "openrouter" as const, model: "openai/gpt-4o-mini", label: "GPT-4o mini via OpenRouter", description: "Use OpenRouter routing and billing" },
  { provider: "openrouter" as const, model: "qwen/qwen2.5-vl-72b-instruct", label: "Qwen 2.5 VL 72B", description: "Open vision model through OpenRouter" },
  { provider: "openai" as const, model: "gpt-4o-mini", label: "GPT-4o mini", description: "Fast, economical image estimates" },
  { provider: "openai" as const, model: "gpt-4o", label: "GPT-4o", description: "More detailed OpenAI vision" },
];

const defaultProvider = "openrouter" as const;
const defaultModel = "openrouter/free";

function validModel(provider: "openai" | "openrouter", model: string) {
  if (provider === "openai") return MODEL_CATALOG.some((item) => item.provider === provider && item.model === model);
  return /^[a-z0-9][a-z0-9._-]{1,80}\/[a-z0-9][a-z0-9._:/-]{1,120}$/i.test(model);
}

export const getSettings = query({
  args: {},
  returns: v.union(publicSettings, v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const settings = await ctx.db.query("modelSettings").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    return {
      provider: settings?.provider ?? defaultProvider,
      model: settings?.model ?? defaultModel,
      openRouterKeyLast4: settings?.openRouterKeyLast4 ?? null,
      openRouterConfigured: Boolean(settings?.openRouterKeyCiphertext),
      catalog: MODEL_CATALOG,
    };
  },
});

export const saveSelection = mutation({
  args: { provider: providers, model: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in to save model settings.");
    const model = args.model.trim();
    if (!validModel(args.provider, model)) throw new Error("Choose a supported image-capable model.");
    const current = await ctx.db.query("modelSettings").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    if (current) await ctx.db.patch(current._id, { provider: args.provider, model, updatedAt: Date.now() });
    else await ctx.db.insert("modelSettings", { userId, provider: args.provider, model, updatedAt: Date.now() });
    return null;
  },
});

export const storeOpenRouterKey = internalMutation({
  args: { userId: v.id("users"), ciphertext: v.string(), last4: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db.query("modelSettings").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    if (current) await ctx.db.patch(current._id, { openRouterKeyCiphertext: args.ciphertext, openRouterKeyLast4: args.last4, updatedAt: Date.now() });
    else await ctx.db.insert("modelSettings", { userId: args.userId, provider: defaultProvider, model: defaultModel, openRouterKeyCiphertext: args.ciphertext, openRouterKeyLast4: args.last4, updatedAt: Date.now() });
    return null;
  },
});

export const clearOpenRouterKeyRecord = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db.query("modelSettings").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    if (current) {
      await ctx.db.replace(current._id, {
        userId: current.userId,
        provider: current.provider,
        model: current.model,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const getProviderSecret = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.object({ provider: providers, model: v.string(), encryptedKey: v.union(v.string(), v.null()) }), v.null()),
  handler: async (ctx, args) => {
    const settings = await ctx.db.query("modelSettings").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    if (!settings) return { provider: defaultProvider, model: defaultModel, encryptedKey: null };
    return { provider: settings.provider, model: settings.model, encryptedKey: settings.openRouterKeyCiphertext ?? null };
  },
});
