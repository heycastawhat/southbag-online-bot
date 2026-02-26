import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const store = mutation({
  args: {
    channelId: v.string(),
    threadTs: v.optional(v.string()),
    role: v.string(),
    content: v.string(),
    userId: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", args);
  },
});

export const getHistory = query({
  args: {
    channelId: v.string(),
    threadTs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("channelId", args.channelId).eq("threadTs", args.threadTs)
      )
      .collect();
    messages.sort((a, b) => a.createdAt - b.createdAt);
    return messages;
  },
});

export const clearHistory = mutation({
  args: {
    channelId: v.string(),
    threadTs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("channelId", args.channelId).eq("threadTs", args.threadTs)
      )
      .collect();
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
  },
});
