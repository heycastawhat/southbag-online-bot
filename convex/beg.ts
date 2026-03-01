import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const beg = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    const now = Date.now();
    if (account.lastBegAt && now - account.lastBegAt < 60_000) {
      const remaining = Math.ceil((60_000 - (now - account.lastBegAt)) / 1000);
      return { error: "cooldown", remaining };
    }

    const roll = Math.random();
    let outcomeType: string;
    let amount: number;
    let message: string;

    if (roll < 0.50) {
      // 50%: Denied
      outcomeType = "denied";
      amount = 0;
      message = "$0.00. Southbag doesn't do charity.";
    } else if (roll < 0.70) {
      // 20%: Tiny amount
      outcomeType = "tiny";
      amount = Math.round((Math.random() * 0.009 + 0.001) * 1000) / 1000;
      message = `You scraped $${amount.toFixed(3)} off the floor. Pathetic.`;
    } else if (roll < 0.85) {
      // 15%: Decent amount
      outcomeType = "decent";
      amount = Math.round((Math.random() * 0.04 + 0.01) * 100) / 100;
      message = `A teller tossed you $${amount.toFixed(2)} out of pity.`;
    } else if (roll < 0.95) {
      // 10%: Reverse beg — charged
      outcomeType = "reverse";
      amount = Math.round((Math.random() * 0.04 + 0.01) * 100) / 100;
      message = `Reverse beg! You got charged $${amount.toFixed(2)} for wasting their time.`;
    } else {
      // 5%: Jackpot pity
      outcomeType = "jackpot";
      amount = Math.round((Math.random() * 0.40 + 0.10) * 100) / 100;
      message = `The teller felt sorry for you. Here's $${amount.toFixed(2)}.`;
    }

    let newBalance: number;
    if (outcomeType === "reverse") {
      newBalance = Math.round((account.balance - amount) * 1000) / 1000;
      await ctx.db.insert("transactions", {
        userId: args.userId,
        type: "fee",
        amount: -amount,
        description: "Reverse beg — charged for wasting time",
        balanceAfter: newBalance,
        createdAt: now,
      });
    } else if (amount > 0) {
      newBalance = Math.round((account.balance + amount) * 1000) / 1000;
      await ctx.db.insert("transactions", {
        userId: args.userId,
        type: "deposit",
        amount,
        description: `Begging proceeds (${outcomeType})`,
        balanceAfter: newBalance,
        createdAt: now,
      });
    } else {
      newBalance = account.balance;
    }

    await ctx.db.patch(account._id, { balance: newBalance, lastBegAt: now });

    return { outcomeType, amount, message, newBalance };
  },
});
