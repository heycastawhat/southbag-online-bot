import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    channelId: v.string(),
    threadTs: v.optional(v.string()),
    role: v.string(),
    content: v.string(),
    userId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_conversation", ["channelId", "threadTs"]),

  accounts: defineTable({
    userId: v.string(),
    accountNumber: v.string(),
    balance: v.number(),
    name: v.optional(v.string()),
    status: v.string(), // "active" | "frozen" | "suspicious" | "vibes-based"
    notifications: v.optional(v.boolean()),
    createdAt: v.number(),
    lastFeeAt: v.number(),
  }).index("by_user", ["userId"]),

  jobs: defineTable({
    userId: v.string(),
    title: v.string(),
    salary: v.number(), // per shift
    hiredAt: v.number(),
    lastWorkedAt: v.number(),
  }).index("by_user", ["userId"]),

  transactions: defineTable({
    userId: v.string(),
    type: v.string(), // "deposit" | "withdrawal" | "transfer" | "fee" | "mystery"
    amount: v.number(),
    description: v.string(),
    balanceAfter: v.number(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
