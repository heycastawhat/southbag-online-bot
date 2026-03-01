import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const COINS: Record<string, { name: string; basePrice: number; volatility: number }> = {
  SBAG: { name: "SouthCoin", basePrice: 1.00, volatility: 0.8 },
  FEES: { name: "FeeCoin", basePrice: 0.50, volatility: 0.6 },
  SCAM: { name: "ScamToken", basePrice: 0.10, volatility: 0.95 },
  HODL: { name: "HODLcoin", basePrice: 2.00, volatility: 0.4 },
  RUG: { name: "RugPull", basePrice: 5.00, volatility: 0.99 },
};

function getCoinPrice(coin: { basePrice: number; volatility: number }): number {
  const price = coin.basePrice * (1 + (Math.sin(Date.now() / 60000 * coin.volatility) * coin.volatility) + (Math.random() - 0.5) * coin.volatility * 0.5);
  return Math.round(Math.max(0.001, price) * 1000) / 1000;
}

export const getPrice = query({
  args: { coin: v.string() },
  handler: async (_ctx, args) => {
    const coinData = COINS[args.coin.toUpperCase()];
    if (!coinData) return { error: "unknown_coin" };
    const price = getCoinPrice(coinData);
    const change24h = Math.round((Math.random() - 0.5) * coinData.volatility * 200) / 100;
    return { coin: args.coin.toUpperCase(), name: coinData.name, price, change24h };
  },
});

export const getPrices = query({
  args: {},
  handler: async () => {
    const prices: Record<string, { name: string; price: number; change24h: number }> = {};
    for (const [symbol, coinData] of Object.entries(COINS)) {
      const price = getCoinPrice(coinData);
      const change24h = Math.round((Math.random() - 0.5) * coinData.volatility * 200) / 100;
      prices[symbol] = { name: coinData.name, price, change24h };
    }
    return prices;
  },
});

export const buy = mutation({
  args: { userId: v.string(), coin: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    const symbol = args.coin.toUpperCase();
    const coinData = COINS[symbol];
    if (!coinData) return { error: "unknown_coin" };

    const blockchainFee = Math.round(args.amount * 0.05 * 100) / 100; // 5% blockchain convenience fee
    const totalCost = Math.round((args.amount + blockchainFee) * 100) / 100;

    if (account.balance < totalCost) return { error: "insufficient", balance: account.balance, needed: totalCost };

    const price = getCoinPrice(coinData);
    const coinsBought = Math.round((args.amount / price) * 100000) / 100000;

    const now = Date.now();
    const afterPurchase = Math.round((account.balance - args.amount) * 100) / 100;
    const newBalance = Math.round((afterPurchase - blockchainFee) * 100) / 100;

    await ctx.db.patch(account._id, { balance: newBalance });

    await ctx.db.insert("cryptoHoldings", {
      userId: args.userId,
      coin: symbol,
      amount: coinsBought,
      boughtAt: price,
      createdAt: now,
    });

    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "withdrawal",
      amount: -args.amount,
      description: `Bought ${coinsBought} ${symbol} (${coinData.name}) @ $${price}`,
      balanceAfter: afterPurchase,
      createdAt: now,
    });

    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -blockchainFee,
      description: "Blockchain convenience fee (5%)",
      balanceAfter: newBalance,
      createdAt: now + 1,
    });

    return { success: true, coin: symbol, coinsBought, pricePerCoin: price, spent: args.amount, fee: blockchainFee, newBalance };
  },
});

export const sell = mutation({
  args: { userId: v.string(), coin: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!account) return { error: "no_account" };

    const symbol = args.coin.toUpperCase();
    const coinData = COINS[symbol];
    if (!coinData) return { error: "unknown_coin" };

    // Find all holdings of this coin
    const holdings = await ctx.db
      .query("cryptoHoldings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const coinHoldings = holdings.filter((h) => h.coin === symbol);

    if (coinHoldings.length === 0) return { error: "no_holdings" };

    const totalCoins = coinHoldings.reduce((sum, h) => sum + h.amount, 0);
    const price = getCoinPrice(coinData);
    const grossValue = Math.round(totalCoins * price * 100) / 100;
    const tax = Math.round(grossValue * 0.10 * 100) / 100; // 10% capital gains tax
    const netValue = Math.round((grossValue - tax) * 100) / 100;

    const now = Date.now();
    const afterSale = Math.round((account.balance + grossValue) * 100) / 100;
    const newBalance = Math.round((afterSale - tax) * 100) / 100;

    await ctx.db.patch(account._id, { balance: newBalance });

    // Delete all holdings of this coin
    for (const holding of coinHoldings) {
      await ctx.db.delete(holding._id);
    }

    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "deposit",
      amount: grossValue,
      description: `Sold ${totalCoins} ${symbol} (${coinData.name}) @ $${price}`,
      balanceAfter: afterSale,
      createdAt: now,
    });

    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "fee",
      amount: -tax,
      description: "Capital gains tax (10%)",
      balanceAfter: newBalance,
      createdAt: now + 1,
    });

    return { success: true, coin: symbol, coinsSold: totalCoins, pricePerCoin: price, grossValue, tax, netValue, newBalance };
  },
});

export const portfolio = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const holdings = await ctx.db
      .query("cryptoHoldings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    if (holdings.length === 0) return { holdings: [], totalValue: 0 };

    const result = holdings.map((h) => {
      const coinData = COINS[h.coin];
      if (!coinData) return { coin: h.coin, name: "Unknown", amount: h.amount, boughtAt: h.boughtAt, currentPrice: 0, value: 0, gainLoss: 0 };
      const currentPrice = getCoinPrice(coinData);
      const value = Math.round(h.amount * currentPrice * 100) / 100;
      const costBasis = Math.round(h.amount * h.boughtAt * 100) / 100;
      const gainLoss = Math.round((value - costBasis) * 100) / 100;
      return { coin: h.coin, name: coinData.name, amount: h.amount, boughtAt: h.boughtAt, currentPrice, value, gainLoss };
    });

    const totalValue = Math.round(result.reduce((sum, h) => sum + h.value, 0) * 100) / 100;
    return { holdings: result, totalValue };
  },
});
