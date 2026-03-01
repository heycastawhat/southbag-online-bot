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
    tier: v.optional(v.string()),
    lastDailyAt: v.optional(v.number()),
    lastBegAt: v.optional(v.number()),
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

  cryptoHoldings: defineTable({
    userId: v.string(),
    coin: v.string(),
    amount: v.number(),
    boughtAt: v.number(), // price per coin when bought
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  insurance: defineTable({
    userId: v.string(),
    plan: v.string(),
    premium: v.number(),
    coveredUntil: v.number(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  heists: defineTable({
    channelId: v.string(),
    startedBy: v.string(),
    participants: v.array(v.string()),
    status: v.string(), // "recruiting" | "completed" | "failed"
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_channel", ["channelId"]),

  loans: defineTable({
    userId: v.string(),
    principal: v.number(),
    interestRate: v.number(), // per hour rate like 0.15 (15%)
    totalOwed: v.number(),
    takenAt: v.number(),
    lastInterestAt: v.number(),
    status: v.string(), // "active" | "defaulted" | "paid"
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
