"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptSecret } from "./lib/secrets";

export const saveOpenRouterKey = action({
  args: { apiKey: v.string() },
  returns: v.object({ last4: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in to save a provider key.");
    const apiKey = args.apiKey.trim();
    if (!apiKey.startsWith("sk-or-v1-") || apiKey.length < 20 || apiKey.length > 512) throw new Error("Enter a valid OpenRouter key beginning with sk-or-v1-.");
    const last4 = apiKey.slice(-4);
    await ctx.runMutation(internal.modelSettings.storeOpenRouterKey, { userId, ciphertext: encryptSecret(apiKey), last4 });
    return { last4 };
  },
});

export const removeOpenRouterKey = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in to remove a provider key.");
    await ctx.runMutation(internal.modelSettings.clearOpenRouterKeyRecord, { userId });
    return null;
  },
});
