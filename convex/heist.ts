import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const start = mutation({
  args: { userId: v.string(), channelId: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };
    if (account.status === "frozen") return { error: "frozen" };

    // Check no active heist in this channel
    const activeHeist = await ctx.db
      .query("heists")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .filter((q) => q.eq(q.field("status"), "recruiting"))
      .first();
    if (activeHeist) return { error: "heist_active" };

    const now = Date.now();
    const fee = 0.05;
    const newBalance = Math.round((account.balance - fee) * 100) / 100;

    await ctx.db.patch(account._id, { balance: newBalance });
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -fee,
      description: "Heist planning fee",
      balanceAfter: newBalance,
      createdAt: now,
    });

    const heistId = await ctx.db.insert("heists", {
      channelId: args.channelId,
      startedBy: args.userId,
      participants: [args.userId],
      status: "recruiting",
      createdAt: now,
    });

    return { success: true, heistId };
  },
});

export const join = mutation({
  args: { userId: v.string(), channelId: v.string() },
  handler: async (ctx, args) => {
    const heist = await ctx.db
      .query("heists")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .filter((q) => q.eq(q.field("status"), "recruiting"))
      .first();
    if (!heist) return { error: "no_heist" };

    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    if (heist.participants.includes(args.userId)) return { error: "already_joined" };
    if (heist.participants.length >= 5) return { error: "heist_full" };

    const now = Date.now();
    const fee = 0.03;
    const newBalance = Math.round((account.balance - fee) * 100) / 100;

    await ctx.db.patch(account._id, { balance: newBalance });
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -fee,
      description: "Heist equipment fee",
      balanceAfter: newBalance,
      createdAt: now,
    });

    const newParticipants = [...heist.participants, args.userId];
    await ctx.db.patch(heist._id, { participants: newParticipants });

    return { success: true, participants: newParticipants.length, participantIds: newParticipants };
  },
});

export const execute = mutation({
  args: { userId: v.string(), channelId: v.string() },
  handler: async (ctx, args) => {
    const heist = await ctx.db
      .query("heists")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .filter((q) => q.eq(q.field("status"), "recruiting"))
      .first();
    if (!heist) return { error: "no_heist" };
    if (heist.startedBy !== args.userId) return { error: "not_starter" };
    if (heist.participants.length < 2) return { error: "need_more_participants" };

    const now = Date.now();
    const successChance = Math.min(0.30 + 0.10 * heist.participants.length, 0.80);
    const succeeded = Math.random() < successChance;

    if (succeeded) {
      const vaultPayout = Math.round((Math.random() * 4.50 + 0.50) * 100) / 100;
      const afterInsurance = Math.round(vaultPayout * 0.75 * 100) / 100;
      const individualShare = Math.round((afterInsurance / heist.participants.length) * 100) / 100;

      for (const participantId of heist.participants) {
        const acc = await ctx.db
          .query("accounts")
          .withIndex("by_user", (q) => q.eq("userId", participantId))
          .first();
        if (!acc) continue;
        const newBal = Math.round((acc.balance + individualShare) * 100) / 100;
        await ctx.db.patch(acc._id, { balance: newBal });
        await ctx.db.insert("transactions", {
          userId: participantId,
          type: "deposit",
          amount: individualShare,
          description: `Heist payout (your share of $${afterInsurance.toFixed(2)})`,
          balanceAfter: newBal,
          createdAt: now,
        });
      }

      await ctx.db.patch(heist._id, { status: "completed", completedAt: now });

      return {
        success: true,
        vaultPayout,
        insuranceDeductible: Math.round((vaultPayout * 0.25) * 100) / 100,
        netPayout: afterInsurance,
        individualShare,
        participants: heist.participants,
      };
    } else {
      const fines: { userId: string; fine: number }[] = [];
      for (const participantId of heist.participants) {
        const acc = await ctx.db
          .query("accounts")
          .withIndex("by_user", (q) => q.eq("userId", participantId))
          .first();
        if (!acc) continue;
        const fine = Math.round((Math.random() * 0.25 + 0.05) * 100) / 100;
        const newBal = Math.round((acc.balance - fine) * 100) / 100;
        await ctx.db.patch(acc._id, { balance: newBal });
        await ctx.db.insert("transactions", {
          userId: participantId,
          type: "fee",
          amount: -fine,
          description: "Heist failure fine",
          balanceAfter: newBal,
          createdAt: now,
        });
        fines.push({ userId: participantId, fine });
      }

      await ctx.db.patch(heist._id, { status: "failed", completedAt: now });

      return {
        success: false,
        participants: heist.participants,
        fines,
      };
    }
  },
});
