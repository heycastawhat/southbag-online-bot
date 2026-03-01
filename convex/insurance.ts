import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const PLANS: Record<string, { name: string; premium: number; duration: number }> = {
  basic: { name: "Basic (covers nothing)", premium: 0.10, duration: 3600000 }, // 1 hour
  silver: { name: "Silver (covers almost nothing)", premium: 0.25, duration: 14400000 }, // 4 hours
  gold: { name: "Gold (still covers nothing)", premium: 0.50, duration: 86400000 }, // 24 hours
};

const DENIAL_REASONS = [
  "Pre-existing condition",
  "Act of Southbag",
  "Insufficient documentation",
  "Claim filed on a day ending in Y",
  "Your policy explicitly excludes this",
  "We lost your paperwork",
  "Claim denied by our AI (it doesn't like you)",
  "Force majeure (we don't feel like it)",
];

export const getPlan = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const insurance = await ctx.db
      .query("insurance")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!insurance) return null;
    const active = insurance.coveredUntil > Date.now();
    return { ...insurance, active };
  },
});

export const purchase = mutation({
  args: { userId: v.string(), plan: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    const planData = PLANS[args.plan.toLowerCase()];
    if (!planData) return { error: "unknown_plan", plans: Object.keys(PLANS) };

    const adminFee = 0.03;
    const totalCost = Math.round((planData.premium + adminFee) * 100) / 100;

    if (account.balance < totalCost) return { error: "insufficient", balance: account.balance, needed: totalCost };

    const now = Date.now();
    const afterPremium = Math.round((account.balance - planData.premium) * 100) / 100;
    const newBalance = Math.round((afterPremium - adminFee) * 100) / 100;

    await ctx.db.patch(account._id, { balance: newBalance });

    // Upsert insurance record
    const existing = await ctx.db
      .query("insurance")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        plan: args.plan.toLowerCase(),
        premium: planData.premium,
        coveredUntil: now + planData.duration,
      });
    } else {
      await ctx.db.insert("insurance", {
        userId: args.userId,
        plan: args.plan.toLowerCase(),
        premium: planData.premium,
        coveredUntil: now + planData.duration,
        createdAt: now,
      });
    }

    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "withdrawal",
      amount: -planData.premium,
      description: `Insurance premium: ${planData.name}`,
      balanceAfter: afterPremium,
      createdAt: now,
    });

    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -adminFee,
      description: "Policy administration fee",
      balanceAfter: newBalance,
      createdAt: now + 1,
    });

    return { success: true, plan: planData.name, premium: planData.premium, adminFee, totalCost, coveredUntil: now + planData.duration, newBalance };
  },
});

export const claim = mutation({
  args: { userId: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    const claimFee = 0.02;
    const newBalance = Math.round((account.balance - claimFee) * 100) / 100;

    await ctx.db.patch(account._id, { balance: newBalance });

    const now = Date.now();
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -claimFee,
      description: "Claim processing fee",
      balanceAfter: newBalance,
      createdAt: now,
    });

    const denialReason = DENIAL_REASONS[Math.floor(Math.random() * DENIAL_REASONS.length)];

    return { success: false, denied: true, reason: denialReason, claimFee, newBalance };
  },
});
