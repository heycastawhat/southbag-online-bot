function formatMoney(n) {
  return `$${n.toFixed(2)}`;
}

function buildHomeBlocks(account, job, loan, transactions, crypto, insurance) {
  const blocks = [];

  // Header
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: 'Southbag Online Banking', emoji: true },
  });
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: '_"Where your money goes to die."_ — Kevin, CEO' },
    ],
  });
  blocks.push({ type: 'divider' });

  if (!account) {
    // No account
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*You do not have a Southbag account.*\n\nUse `/south-open-account` to open one. We promise it will be the worst financial decision you make today.',
      },
    });
    return blocks;
  }

  // Account overview
  const tier = account.tier || 'None';

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Account Overview*`,
    },
  });
  blocks.push({
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: `*Account Number*\n\`${account.accountNumber}\`` },
      { type: 'mrkdwn', text: `*Balance*\n${formatMoney(account.balance)}` },
      { type: 'mrkdwn', text: `*Status*\n${account.status}` },
      { type: 'mrkdwn', text: `*Tier*\n${tier}` },
    ],
  });
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `Notifications: ${account.notifications ? 'On' : 'Off'} · Opened: ${new Date(account.createdAt).toLocaleDateString()}` },
    ],
  });
  blocks.push({ type: 'divider' });

  // Employment
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Employment*',
    },
  });
  if (job) {
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Position*\n${job.title}` },
        { type: 'mrkdwn', text: `*Salary*\n${formatMoney(job.salary)} per shift (before 40% tax)` },
      ],
    });
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Use \`/south-work\` to do a shift · \`/south-quit\` to escape` },
      ],
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_Unemployed._ Use `/south-job` to apply. We\'re always hiring because everyone quits.' },
    });
  }
  blocks.push({ type: 'divider' });

  // Active Loan
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Loan Status*',
    },
  });
  if (loan) {
    const hoursSince = Math.round(loan.hoursSince * 100) / 100;
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Principal*\n${formatMoney(loan.principal)}` },
        { type: 'mrkdwn', text: `*Interest Rate*\n${(loan.interestRate * 100).toFixed(0)}% per hour` },
        { type: 'mrkdwn', text: `*Interest Accrued*\n${formatMoney(loan.interestAccrued)}` },
        { type: 'mrkdwn', text: `*Total Owed*\n${formatMoney(loan.currentOwed)}` },
      ],
    });
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Loan age: ${hoursSince}h · \`/south-loan repay\` to pay · \`/south-loan default\` to ruin everything` },
      ],
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No active loan._ Use `/south-loan <amount>` to take one out. Interest rates are criminal.' },
    });
  }
  blocks.push({ type: 'divider' });

  // Insurance
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Insurance*',
    },
  });
  if (insurance) {
    const active = insurance.active;
    const expiresText = active
      ? `Expires: ${new Date(insurance.coveredUntil).toLocaleString()}`
      : '*EXPIRED*';
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Plan*\n${insurance.plan}` },
        { type: 'mrkdwn', text: `*Premium Paid*\n${formatMoney(insurance.premium)}` },
        { type: 'mrkdwn', text: `*Status*\n${active ? 'Active' : 'Expired'}` },
        { type: 'mrkdwn', text: `*Coverage*\n${expiresText}` },
      ],
    });
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: '_Claims are always denied. But you paid anyway._' },
      ],
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_Uninsured._ Use `/south-insure buy <basic|silver|gold>`. It won\'t help, but it costs money.' },
    });
  }
  blocks.push({ type: 'divider' });

  // Crypto portfolio
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Crypto Portfolio*',
    },
  });
  if (crypto && crypto.holdings && crypto.holdings.length > 0) {
    const lines = crypto.holdings.map((h) => {
      const gl = h.gainLoss >= 0 ? `+${formatMoney(h.gainLoss)}` : `-${formatMoney(Math.abs(h.gainLoss))}`;
      return `*${h.coin}* (${h.name}) — ${h.amount} coins @ ${formatMoney(h.currentPrice)} = ${formatMoney(h.value)} (${gl})`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') },
    });
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Total portfolio value: *${formatMoney(crypto.totalValue)}* · \`/south-crypto sell <coin>\` to cash out (10% tax)` },
      ],
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No crypto holdings._ Use `/south-crypto prices` to browse · `/south-crypto buy <coin> <amount>` to invest badly.' },
    });
  }
  blocks.push({ type: 'divider' });

  // Recent transactions
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Recent Transactions*',
    },
  });
  if (transactions && transactions.length > 0) {
    const lines = transactions.slice(0, 10).map((t) => {
      const sign = t.amount >= 0 ? '+' : '';
      const date = new Date(t.createdAt).toLocaleDateString();
      return `${date}  ${sign}${formatMoney(Math.abs(t.amount))}  ${t.description}`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') },
    });
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Showing last ${Math.min(transactions.length, 10)} transactions · \`/south-transactions\` for full history` },
      ],
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No transactions yet. Give it time._' },
    });
  }
  blocks.push({ type: 'divider' });

  // Quick commands reference
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Quick Commands*',
    },
  });
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: [
        '*Banking:* `/south-balance` · `/south-transfer` · `/south-deposit`',
        '*Income:* `/south-daily` · `/south-job` · `/south-work` · `/south-beg`',
        '*Gambling:* `/south-coinflip` · `/south-slots` · `/south-gamble`',
        '*Crime:* `/south-rob` · `/south-heist`',
        '*Investing:* `/south-crypto` · `/south-upgrade`',
        '*Other:* `/south-gift` · `/south-insure` · `/south-loan` · `/south-mystery-fee`',
        '*Settings:* `/south-notifs`',
      ].join('\n'),
    },
  });
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: '_Southbag Online Banking. We\'re not sorry._' },
    ],
  });

  return blocks;
}

function registerAppHome(app, convex, api) {
  app.event('app_home_opened', async ({ event, client }) => {
    if (event.tab !== 'home') return;

    const userId = event.user;

    // Fetch all user data in parallel
    const [account, job, loan, transactions, crypto, insurance] = await Promise.all([
      convex.query(api.accounts.get, { userId }).catch(() => null),
      convex.query(api.jobs.getJob, { userId }).catch(() => null),
      convex.query(api.loans.check, { userId }).catch(() => null),
      convex.query(api.transactions.list, { userId }).catch(() => []),
      convex.query(api.crypto.portfolio, { userId }).catch(() => null),
      convex.query(api.insurance.getPlan, { userId }).catch(() => null),
    ]);

    const blocks = buildHomeBlocks(account, job, loan, transactions, crypto, insurance);

    try {
      await client.views.publish({
        user_id: userId,
        view: {
          type: 'home',
          blocks,
        },
      });
    } catch (err) {
      console.error('Error publishing App Home:', err);
    }
  });
}

module.exports = { registerAppHome };
