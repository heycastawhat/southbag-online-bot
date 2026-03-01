import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const take = mutation({
  args: { userId: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };
    if (account.status === "frozen") return { error: "frozen" };

    if (args.amount < 0.10) return { error: "min_loan", min: 0.10 };
    if (args.amount > 10.00) return { error: "max_loan", max: 10.00 };

    // Check no existing active loan
    const existingLoan = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (existingLoan) return { error: "existing_loan" };

    const now = Date.now();
    const interestRate = Math.round((Math.random() * 0.35 + 0.15) * 100) / 100; // 15%-50% per hour
    const principal = Math.round(args.amount * 100) / 100;

    await ctx.db.insert("loans", {
      userId: args.userId,
      principal,
      interestRate,
      totalOwed: principal,
      takenAt: now,
      lastInterestAt: now,
      status: "active",
    });

    const newBalance = Math.round((account.balance + principal) * 100) / 100;
    await ctx.db.patch(account._id, { balance: newBalance });
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "deposit",
      amount: principal,
      description: `Loan disbursement (${(interestRate * 100).toFixed(0)}% per hour interest — good luck)`,
      balanceAfter: newBalance,
      createdAt: now,
    });

    return { success: true, principal, interestRate, totalOwed: principal };
  },
});

export const check = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const loan = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!loan) return null;

    const now = Date.now();
    const hoursSince = (now - loan.takenAt) / (1000 * 60 * 60);
    const currentOwed = Math.round(loan.principal * Math.pow(1 + loan.interestRate, hoursSince) * 100) / 100;
    const interestAccrued = Math.round((currentOwed - loan.principal) * 100) / 100;

    return {
      principal: loan.principal,
      interestRate: loan.interestRate,
      currentOwed,
      hoursSince: Math.round(hoursSince * 100) / 100,
      interestAccrued,
      takenAt: loan.takenAt,
      status: loan.status,
    };
  },
});

export const repay = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const loan = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!loan) return { error: "no_loan" };

    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    const now = Date.now();
    const hoursSince = (now - loan.takenAt) / (1000 * 60 * 60);
    const totalOwed = Math.round(loan.principal * Math.pow(1 + loan.interestRate, hoursSince) * 100) / 100;

    if (account.balance < totalOwed) {
      return { error: "insufficient", owed: totalOwed, balance: account.balance };
    }

    const interestPaid = Math.round((totalOwed - loan.principal) * 100) / 100;
    const newBalance = Math.round((account.balance - totalOwed) * 100) / 100;

    await ctx.db.patch(account._id, { balance: newBalance });
    await ctx.db.patch(loan._id, { status: "paid", totalOwed });

    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "withdrawal",
      amount: -totalOwed,
      description: `Loan repayment (principal: $${loan.principal.toFixed(2)}, interest: $${interestPaid.toFixed(2)})`,
      balanceAfter: newBalance,
      createdAt: now,
    });

    return { success: true, principal: loan.principal, totalPaid: totalOwed, interestPaid, newBalance };
  },
});

export const default_ = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const loan = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!loan) return { error: "no_loan" };

    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    const now = Date.now();
    const hoursSince = (now - loan.takenAt) / (1000 * 60 * 60);
    const amountDefaulted = Math.round(loan.principal * Math.pow(1 + loan.interestRate, hoursSince) * 100) / 100;

    await ctx.db.patch(loan._id, { status: "defaulted", totalOwed: amountDefaulted });
    await ctx.db.patch(account._id, { status: "frozen" });

    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -amountDefaulted,
      description: `Loan default — account frozen (owed $${amountDefaulted.toFixed(2)})`,
      balanceAfter: account.balance,
      createdAt: now,
    });

    return { success: true, amountDefaulted };
  },
});
