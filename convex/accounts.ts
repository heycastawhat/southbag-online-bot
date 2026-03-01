import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const open = mutation({
  args: { userId: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Check if account already exists
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) return existing;

    // Generate a ridiculous account number
    const segments = [
      Math.floor(Math.random() * 9000 + 1000),
      "SBAG",
      Math.floor(Math.random() * 90000 + 10000),
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ];
    const accountNumber = segments.join("-");

    // Start with a pathetically small random balance
    const startingBalances = [0.01, 0.03, 0.47, 1.23, 3.50, 0.69, 2.01, 0.10, 4.20, 0.99];
    const balance = startingBalances[Math.floor(Math.random() * startingBalances.length)];

    const now = Date.now();
    const id = await ctx.db.insert("accounts", {
      userId: args.userId,
      accountNumber,
      balance,
      name: args.name,
      status: "active",
      createdAt: now,
      lastFeeAt: now,
    });

    // Record the opening "deposit"
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "deposit",
      amount: balance,
      description: "Welcome bonus (we were feeling generous)",
      balanceAfter: balance,
      createdAt: now,
    });

    // Immediately charge an account opening fee
    const fee = 0.005;
    const afterFee = Math.round((balance - fee) * 100) / 100;
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -fee,
      description: "Account opening fee",
      balanceAfter: afterFee,
      createdAt: now + 1,
    });

    const account = await ctx.db.get(id);
    // Update balance after fee
    await ctx.db.patch(id, { balance: afterFee });
    return { ...account, balance: afterFee };
  },
});

export const getBalance = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return null;
    return {
      balance: account.balance,
      accountNumber: account.accountNumber,
      status: account.status,
    };
  },
});

export const chargeFee = mutation({
  args: {
    userId: v.string(),
    amount: v.number(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return null;

    const newBalance = Math.round((account.balance - args.amount) * 100) / 100;
    await ctx.db.patch(account._id, { balance: newBalance, lastFeeAt: Date.now() });
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -args.amount,
      description: args.description,
      balanceAfter: newBalance,
      createdAt: Date.now(),
    });
    return newBalance;
  },
});

export const transfer = mutation({
  args: {
    userId: v.string(),
    amount: v.number(),
    recipient: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };
    if (account.status === "frozen") return { error: "frozen" };

    // Calculate absurd fees
    const processingFee = 0.50;
    const transferFee = Math.round(args.amount * 0.15 * 100) / 100; // 15% transfer fee
    const breathingFee = 0.02;
    const totalFees = Math.round((processingFee + transferFee + breathingFee) * 100) / 100;
    const totalDeducted = Math.round((args.amount + totalFees) * 100) / 100;

    if (account.balance < totalDeducted) return { error: "insufficient", balance: account.balance, needed: totalDeducted };

    const now = Date.now();
    const afterTransfer = Math.round((account.balance - args.amount) * 100) / 100;
    const afterFees = Math.round((afterTransfer - totalFees) * 100) / 100;

    // Record the transfer
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "transfer",
      amount: -args.amount,
      description: `Transfer to ${args.recipient}`,
      balanceAfter: afterTransfer,
      createdAt: now,
    });

    // Record fees individually
    const fees = [
      { amount: processingFee, desc: "Processing fee" },
      { amount: transferFee, desc: "Transfer fee (15%)" },
      { amount: breathingFee, desc: "Breathing fee" },
    ];
    let running = afterTransfer;
    for (let i = 0; i < fees.length; i++) {
      running = Math.round((running - fees[i].amount) * 100) / 100;
      await ctx.db.insert("transactions", {
        userId: args.userId,
        type: "fee",
        amount: -fees[i].amount,
        description: fees[i].desc,
        balanceAfter: running,
        createdAt: now + i + 1,
      });
    }

    await ctx.db.patch(account._id, { balance: afterFees });

    return {
      success: true,
      amount: args.amount,
      fees: totalFees,
      feeBreakdown: fees,
      newBalance: afterFees,
    };
  },
});

export const deposit = mutation({
  args: {
    userId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    // Only let them deposit a fraction of what they asked
    const actualAmount = Math.round(args.amount * 0.73 * 100) / 100; // 27% deposit shrinkage
    const convenienceFee = 0.25;
    const net = Math.round((actualAmount - convenienceFee) * 100) / 100;
    const newBalance = Math.round((account.balance + net) * 100) / 100;

    const now = Date.now();
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "deposit",
      amount: actualAmount,
      description: `Deposit (adjusted for market conditions)`,
      balanceAfter: Math.round((account.balance + actualAmount) * 100) / 100,
      createdAt: now,
    });
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -convenienceFee,
      description: "Deposit convenience fee",
      balanceAfter: newBalance,
      createdAt: now + 1,
    });

    await ctx.db.patch(account._id, { balance: newBalance });
    return { success: true, requested: args.amount, actual: actualAmount, fee: convenienceFee, newBalance };
  },
});

export const freezeAccount = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return null;
    await ctx.db.patch(account._id, { status: "frozen" });
    return true;
  },
});

export const rob = mutation({
  args: {
    robberId: v.string(),
    victimId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.robberId === args.victimId) return { error: "self_rob" };

    const robber = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.robberId))
      .first();
    if (!robber) return { error: "no_account" };
    if (robber.status === "frozen") return { error: "frozen" };

    const victim = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.victimId))
      .first();
    if (!victim) return { error: "no_victim" };

    const now = Date.now();
    const caught = Math.random() < 0.45;

    if (caught) {
      // Caught! Fine the robber
      const fine = Math.round((Math.random() * 1.5 + 0.50) * 100) / 100;
      const newBalance = Math.round((robber.balance - fine) * 100) / 100;
      await ctx.db.patch(robber._id, { balance: newBalance, status: "suspicious" });
      await ctx.db.insert("transactions", {
        userId: args.robberId,
        type: "fee",
        amount: -fine,
        description: "Attempted robbery fine",
        balanceAfter: newBalance,
        createdAt: now,
      });
      return { success: false, fine, newBalance, victimId: args.victimId };
    }

    // Successful robbery
    const maxSteal = Math.min(victim.balance, 2.00);
    if (maxSteal <= 0) return { error: "victim_broke" };
    const stolen = Math.round((Math.random() * maxSteal * 0.5 + 0.01) * 100) / 100;
    const fence = Math.round(stolen * 0.30 * 100) / 100; // 30% fencing fee
    const net = Math.round((stolen - fence) * 100) / 100;

    const victimNewBal = Math.round((victim.balance - stolen) * 100) / 100;
    const robberNewBal = Math.round((robber.balance + net) * 100) / 100;

    await ctx.db.patch(victim._id, { balance: victimNewBal });
    await ctx.db.patch(robber._id, { balance: robberNewBal });

    await ctx.db.insert("transactions", {
      userId: args.victimId,
      type: "withdrawal",
      amount: -stolen,
      description: "Mysterious disappearance of funds",
      balanceAfter: victimNewBal,
      createdAt: now,
    });
    await ctx.db.insert("transactions", {
      userId: args.robberId,
      type: "deposit",
      amount: net,
      description: "Found money on the ground",
      balanceAfter: robberNewBal,
      createdAt: now,
    });
    await ctx.db.insert("transactions", {
      userId: args.robberId,
      type: "fee",
      amount: -fence,
      description: "Fencing fee (30%)",
      balanceAfter: robberNewBal,
      createdAt: now + 1,
    });

    return { success: true, stolen, fence, net, robberNewBal, victimNewBal, victimId: args.victimId };
  },
});

export const toggleNotifications = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return null;
    const newVal = !account.notifications;
    await ctx.db.patch(account._id, { notifications: newVal });
    return newVal;
  },
});

export const getNotificationUsers = query({
  args: { userIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const result: string[] = [];
    for (const userId of args.userIds) {
      const account = await ctx.db
        .query("accounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (account?.notifications) result.push(userId);
    }
    return result;
  },
});

const TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Obsidian"];
const TIER_COSTS = [0.10, 0.25, 0.50, 1.00, 2.00, 5.00];

export const upgrade = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    const currentIndex = account.tier ? TIERS.indexOf(account.tier) : -1;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= TIERS.length) return { error: "max_tier", tier: account.tier };

    const cost = TIER_COSTS[nextIndex];
    if (account.balance < cost) return { error: "insufficient", balance: account.balance, needed: cost };

    const newBalance = Math.round((account.balance - cost) * 100) / 100;
    const newTier = TIERS[nextIndex];

    await ctx.db.patch(account._id, { balance: newBalance, tier: newTier });

    const now = Date.now();
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -cost,
      description: `Account upgrade to ${newTier} (does absolutely nothing)`,
      balanceAfter: newBalance,
      createdAt: now,
    });

    return { success: true, previousTier: account.tier || "None", newTier, cost, newBalance };
  },
});

export const gift = mutation({
  args: { senderId: v.string(), recipientId: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    if (args.senderId === args.recipientId) return { error: "self_gift" };

    const sender = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.senderId))
      .first();
    if (!sender) return { error: "no_sender_account" };

    const recipient = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.recipientId))
      .first();
    if (!recipient) return { error: "no_recipient_account" };

    const tax = Math.round(args.amount * 0.20 * 100) / 100; // 20% generosity tax
    const totalDeducted = Math.round((args.amount + tax) * 100) / 100;

    if (sender.balance < totalDeducted) return { error: "insufficient", balance: sender.balance, needed: totalDeducted };

    const now = Date.now();
    const senderNewBalance = Math.round((sender.balance - totalDeducted) * 100) / 100;
    const recipientNewBalance = Math.round((recipient.balance + args.amount) * 100) / 100;

    await ctx.db.patch(sender._id, { balance: senderNewBalance });
    await ctx.db.patch(recipient._id, { balance: recipientNewBalance });

    await ctx.db.insert("transactions", {
      userId: args.senderId,
      type: "transfer",
      amount: -args.amount,
      description: `Gift to <@${args.recipientId}>`,
      balanceAfter: Math.round((sender.balance - args.amount) * 100) / 100,
      createdAt: now,
    });

    await ctx.db.insert("transactions", {
      userId: args.senderId,
      type: "fee",
      amount: -tax,
      description: "Generosity tax (20%)",
      balanceAfter: senderNewBalance,
      createdAt: now + 1,
    });

    await ctx.db.insert("transactions", {
      userId: args.recipientId,
      type: "deposit",
      amount: args.amount,
      description: `Gift from <@${args.senderId}>`,
      balanceAfter: recipientNewBalance,
      createdAt: now,
    });

    return { success: true, amount: args.amount, tax, totalDeducted, senderNewBalance, recipientNewBalance };
  },
});

export const setStatus = mutation({
  args: { userId: v.string(), status: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return null;
    await ctx.db.patch(account._id, { status: args.status });
    return true;
  },
});
