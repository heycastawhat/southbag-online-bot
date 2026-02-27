import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const coinflip = mutation({
  args: {
    userId: v.string(),
    bet: v.number(),
    call: v.string(), // "heads" | "tails"
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };
    if (account.status === "frozen") return { error: "frozen" };
    if (account.balance < args.bet) return { error: "insufficient", balance: account.balance };

    const result = Math.random() < 0.5 ? "heads" : "tails";
    const won = result === args.call;
    const now = Date.now();

    // House edge: win pays 1.8x, not 2x
    const payout = won ? Math.round(args.bet * 1.8 * 100) / 100 : 0;
    const net = won ? Math.round((payout - args.bet) * 100) / 100 : -args.bet;
    const newBalance = Math.round((account.balance + net) * 100) / 100;

    await ctx.db.patch(account._id, { balance: newBalance });
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: won ? "deposit" : "withdrawal",
      amount: net,
      description: `Coinflip: ${won ? "Won" : "Lost"} (${result})`,
      balanceAfter: newBalance,
      createdAt: now,
    });

    return { won, result, call: args.call, bet: args.bet, payout, net, newBalance };
  },
});

const SLOT_SYMBOLS = ["🍋", "🍒", "💰", "💎", "💀", "🏦", "📉"];

export const slots = mutation({
  args: {
    userId: v.string(),
    bet: v.number(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };
    if (account.status === "frozen") return { error: "frozen" };
    if (account.balance < args.bet) return { error: "insufficient", balance: account.balance };

    const r1 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    const r2 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    const r3 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    const reels = [r1, r2, r3];
    const now = Date.now();

    let multiplier = 0;
    if (r1 === r2 && r2 === r3) {
      // Jackpot — three of a kind
      if (r1 === "💎") multiplier = 10;
      else if (r1 === "💰") multiplier = 7;
      else if (r1 === "💀") multiplier = -3; // three skulls = you lose 3x your bet
      else multiplier = 5;
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
      // Two matching
      multiplier = 1.5;
    } else {
      // Nothing
      multiplier = 0;
    }

    const payout = multiplier > 0 ? Math.round(args.bet * multiplier * 100) / 100 : 0;
    const penalty = multiplier < 0 ? Math.round(args.bet * Math.abs(multiplier) * 100) / 100 : 0;
    const net = multiplier < 0 ? -(args.bet + penalty) : (payout > 0 ? Math.round((payout - args.bet) * 100) / 100 : -args.bet);
    const newBalance = Math.round((account.balance + net) * 100) / 100;

    const won = multiplier > 0;

    await ctx.db.patch(account._id, { balance: newBalance });
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: won ? "deposit" : "withdrawal",
      amount: net,
      description: `Slots: ${reels.join(" ")} — ${won ? "Won" : multiplier < 0 ? "Cursed" : "Lost"}`,
      balanceAfter: newBalance,
      createdAt: now,
    });

    return { reels, won, multiplier, bet: args.bet, payout, net, newBalance };
  },
});

export const gamble = mutation({
  args: {
    userId: v.string(),
    bet: v.number(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };
    if (account.status === "frozen") return { error: "frozen" };
    if (account.balance < args.bet) return { error: "insufficient", balance: account.balance };

    const now = Date.now();
    const roll = Math.random() * 100;

    let multiplier: number;
    let outcome: string;

    if (roll < 1) {
      // 1% — Jackpot
      multiplier = 15;
      outcome = "JACKPOT";
    } else if (roll < 5) {
      // 4% — Big win
      multiplier = 5;
      outcome = "Big win";
    } else if (roll < 15) {
      // 10% — Nice win
      multiplier = 3;
      outcome = "Nice win";
    } else if (roll < 35) {
      // 20% — Small win
      multiplier = 1.5;
      outcome = "Small win";
    } else if (roll < 50) {
      // 15% — Break even (minus house fee)
      multiplier = 0.9;
      outcome = "Break even (house fee applied)";
    } else if (roll < 85) {
      // 35% — Loss
      multiplier = 0;
      outcome = "Loss";
    } else if (roll < 95) {
      // 10% — Double loss
      multiplier = -1;
      outcome = "Double loss";
    } else {
      // 5% — Catastrophic
      multiplier = -2;
      outcome = "Catastrophic loss";
    }

    const payout = multiplier > 0 ? Math.round(args.bet * multiplier * 100) / 100 : 0;
    const penalty = multiplier < 0 ? Math.round(args.bet * Math.abs(multiplier) * 100) / 100 : 0;
    const net = multiplier < 0 ? -(args.bet + penalty) : (payout > 0 ? Math.round((payout - args.bet) * 100) / 100 : -args.bet);
    const newBalance = Math.round((account.balance + net) * 100) / 100;
    const won = multiplier > 0;

    await ctx.db.patch(account._id, { balance: newBalance });
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: won ? "deposit" : "withdrawal",
      amount: net,
      description: `Card Game: ${outcome}`,
      balanceAfter: newBalance,
      createdAt: now,
    });

    return { won, outcome, multiplier, bet: args.bet, payout, net, newBalance };
  },
});
