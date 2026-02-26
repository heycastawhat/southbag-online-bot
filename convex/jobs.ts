import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const JOB_LISTINGS = [
  { title: "Southbag Branch Greeter", salary: 1 },
  { title: "ATM Apology Writer", salary: 1.5 },
  { title: "Fee Explanation Specialist", salary: 0.04 },
  { title: "Complaint Ignorer", salary: 0.06 },
  { title: "Password Reset Denier", salary: 2.02 },
  { title: "Queue Extension Coordinator", salary: 1.07 },
  { title: "Hold Music DJ", salary: 6 },
  { title: "Overdraft Celebration Planner", salary: 0.05 },
  { title: "Terms & Conditions Lengthener", salary: 0.08 },
  { title: "Customer Disappointment Analyst", salary: 0.03 },
  { title: "Lobby Floor Starer", salary: 0.01 },
  { title: "Senior Vice President of Nothing", salary: 100 },
  { title: "Chief Vibes Officer", salary: 9 },
  { title: "Intern (Unpaid)", salary: 0.0 },
  { title: "Executive Paper Shredder", salary: 0.06 },
  { title: "Vibe Coder" , salary: 2.0 },
];

export const getJob = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const apply = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) return { error: "already_employed", title: existing.title };

    // Check they have an account
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    // Random job assignment
    const job = JOB_LISTINGS[Math.floor(Math.random() * JOB_LISTINGS.length)];
    const now = Date.now();

    await ctx.db.insert("jobs", {
      userId: args.userId,
      title: job.title,
      salary: job.salary,
      hiredAt: now,
      lastWorkedAt: 0,
    });

    // Charge a uniform fee
    const uniformFee = 0.02;
    const newBalance = Math.round((account.balance - uniformFee) * 100) / 100;
    await ctx.db.patch(account._id, { balance: newBalance });
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -uniformFee,
      description: "Uniform deposit fee",
      balanceAfter: newBalance,
      createdAt: now,
    });

    return { success: true, title: job.title, salary: job.salary, uniformFee };
  },
});

export const work = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!job) return { error: "no_job" };

    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    const now = Date.now();
    const cooldown = 30 * 1000; // 30 seconds between shifts
    if (job.lastWorkedAt && now - job.lastWorkedAt < cooldown) {
      const remaining = Math.ceil((cooldown - (now - job.lastWorkedAt)) / 1000);
      return { error: "cooldown", remaining };
    }

    // Random work outcomes
    const roll = Math.random();
    let pay = job.salary;
    let event = "Completed a shift";

    if (roll < 0.10) {
      // Overtime bonus
      pay = Math.round(pay * 2.5 * 100) / 100;
      event = "Overtime bonus shift";
    } else if (roll < 0.20) {
      // Docked pay
      pay = Math.round(pay * 0.3 * 100) / 100;
      event = "Pay docked (bad attitude)";
    } else if (roll < 0.25) {
      // Workplace incident — you owe money
      const fine = Math.round((Math.random() * 0.10 + 0.01) * 100) / 100;
      const fineBalance = Math.round((account.balance - fine) * 100) / 100;
      await ctx.db.patch(account._id, { balance: fineBalance });
      await ctx.db.patch(job._id, { lastWorkedAt: now });
      await ctx.db.insert("transactions", {
        userId: args.userId,
        type: "fee",
        amount: -fine,
        description: "Workplace incident fine",
        balanceAfter: fineBalance,
        createdAt: now,
      });
      return { success: true, event: "Workplace incident", pay: -fine, newBalance: fineBalance, title: job.title };
    }

    // Tax: 40% income tax
    const tax = Math.round(pay * 0.40 * 100) / 100;
    const net = Math.round((pay - tax) * 100) / 100;
    const newBalance = Math.round((account.balance + net) * 100) / 100;

    await ctx.db.patch(account._id, { balance: newBalance });
    await ctx.db.patch(job._id, { lastWorkedAt: now });

    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "deposit",
      amount: net,
      description: `Salary: ${job.title} (${event})`,
      balanceAfter: newBalance,
      createdAt: now,
    });
    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -tax,
      description: "Income tax (40%)",
      balanceAfter: newBalance,
      createdAt: now + 1,
    });

    return { success: true, event, gross: pay, tax, net, newBalance, title: job.title };
  },
});

export const quit = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!job) return { error: "no_job" };

    const title = job.title;
    await ctx.db.delete(job._id);

    // Charge an exit interview fee
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (account) {
      const exitFee = 0.05;
      const newBalance = Math.round((account.balance - exitFee) * 100) / 100;
      await ctx.db.patch(account._id, { balance: newBalance });
      await ctx.db.insert("transactions", {
        userId: args.userId,
        type: "fee",
        amount: -exitFee,
        description: "Exit interview fee",
        balanceAfter: newBalance,
        createdAt: Date.now(),
      });
    }

    return { success: true, title };
  },
});
