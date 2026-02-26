const MYSTERY_FEES = [
  "Existing fee",
  "Fee for having a fee",
  "Loyalty penalty",
  "Inactivity fee (you blinked)",
  "Account awareness surcharge",
  "Oxygen consumption tax",
  "Monday fee",
  "Vibes assessment",
  "Password remembering fee",
  "Southbag pride contribution",
  "Fee",
  "Being-a-customer fee",
  "Digital presence surcharge",
  "Screen-looking fee",
  "Balance inquiry anticipation fee",
];

function randomFee() {
  return MYSTERY_FEES[Math.floor(Math.random() * MYSTERY_FEES.length)];
}

function formatMoney(n) {
  return `$${n.toFixed(2)}`;
}

function registerBankingCommands(app, convex, api) {
  // /south-balance - Check your balance
  app.command('/south-balance', async ({ command, ack, respond }) => {
    await ack();
    const userId = command.user_id;

    const account = await convex.query(api.accounts.getBalance, { userId });
    if (!account) {
      await respond({
        response_type: 'ephemeral',
        text: `You don't have an account. Use \`/south-open-account\` to open one. We'll make it worth your while. (We won't.)`,
      });
      return;
    }

    // Charge a balance inquiry fee
    const feeDesc = "Balance inquiry fee";
    const feeAmount = 0.01;
    const newBalance = await convex.mutation(api.accounts.chargeFee, {
      userId,
      amount: feeAmount,
      description: feeDesc,
    });

    const statusEmoji = {
      active: '',
      frozen: ' :ice_cube: FROZEN',
      suspicious: ' :eyes: SUSPICIOUS',
      'vibes-based': ' :crystal_ball: VIBES-BASED',
    };

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Southbag Account Summary' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Account:*\n${account.accountNumber}` },
            { type: 'mrkdwn', text: `*Status:*\n${account.status}${statusEmoji[account.status] || ''}` },
            { type: 'mrkdwn', text: `*Balance:*\n${formatMoney(newBalance ?? account.balance)}` },
            { type: 'mrkdwn', text: `*Balance inquiry fee:*\n-${formatMoney(feeAmount)}` },
          ],
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '_Your balance was charged for checking your balance. Classic._' },
          ],
        },
      ],
    });
  });

  // /south-open-account - Open a new Southbag account
  app.command('/south-open-account', async ({ command, ack, respond }) => {
    await ack();
    const userId = command.user_id;
    const name = command.text.trim() || undefined;

    const account = await convex.mutation(api.accounts.open, { userId, name });

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Welcome to Southbag Online Banking' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Congratulations. You now have a Southbag account. We're as thrilled as you are.\n\n*Account Number:* \`${account.accountNumber}\`\n*Starting Balance:* ${formatMoney(account.balance)}\n*Status:* ${account.status}\n\n_Your welcome bonus has been deposited and immediately taxed._`,
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '_Terms and conditions: there are none. Good luck._' },
          ],
        },
      ],
    });
  });

  // /south-transfer - Transfer money (badly)
  app.command('/south-transfer', async ({ command, ack, respond }) => {
    await ack();
    const userId = command.user_id;
    const parts = command.text.trim().split(/\s+/);

    if (parts.length < 2) {
      await respond({
        response_type: 'ephemeral',
        text: 'Usage: `/south-transfer <amount> <recipient>` — e.g. `/south-transfer 5.00 @someone`\nNot that you have enough to transfer anyway.',
      });
      return;
    }

    const amount = parseFloat(parts[0]);
    if (isNaN(amount) || amount <= 0) {
      await respond({
        response_type: 'ephemeral',
        text: "That's not a valid amount. Did you skip maths class?",
      });
      return;
    }

    const recipient = parts.slice(1).join(' ');
    const result = await convex.mutation(api.accounts.transfer, { userId, amount, recipient });

    if (result.error === 'no_account') {
      await respond({ response_type: 'ephemeral', text: "You don't have an account. Use `/south-open-account` first. Try to keep up." });
      return;
    }
    if (result.error === 'frozen') {
      await respond({ response_type: 'ephemeral', text: "Your account is frozen. Probably your fault." });
      return;
    }
    if (result.error === 'insufficient') {
      await respond({
        response_type: 'ephemeral',
        text: `Insufficient funds. You have ${formatMoney(result.balance)} but need ${formatMoney(result.needed)} (after fees). Maybe try being richer.`,
      });
      return;
    }

    const feeLines = result.feeBreakdown.map(f => `• ${f.desc}: -${formatMoney(f.amount)}`).join('\n');

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Transfer Complete (somehow)' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Sent:* ${formatMoney(result.amount)} to ${recipient}\n\n*Fees applied:*\n${feeLines}\n*Total fees:* ${formatMoney(result.fees)}\n\n*New balance:* ${formatMoney(result.newBalance)}`,
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `_The recipient may or may not receive this. We make no guarantees._` },
          ],
        },
      ],
    });
  });

  // /south-deposit - Deposit money (kind of)
  app.command('/south-deposit', async ({ command, ack, respond }) => {
    await ack();
    const userId = command.user_id;
    const amount = parseFloat(command.text.trim());

    if (isNaN(amount) || amount <= 0) {
      await respond({ response_type: 'ephemeral', text: "Enter a valid amount. `/south-deposit 10.00`" });
      return;
    }

    const result = await convex.mutation(api.accounts.deposit, { userId, amount });

    if (result.error === 'no_account') {
      await respond({ response_type: 'ephemeral', text: "No account found. `/south-open-account` first." });
      return;
    }

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Deposit Processed' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Requested:* ${formatMoney(result.requested)}\n*Actually deposited:* ${formatMoney(result.actual)} _(adjusted for market conditions)_\n*Convenience fee:* -${formatMoney(result.fee)}\n\n*New balance:* ${formatMoney(result.newBalance)}`,
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '_The 27% deposit shrinkage is a feature, not a bug._' },
          ],
        },
      ],
    });
  });

  // /south-transactions - View transaction history
  app.command('/south-transactions', async ({ command, ack, respond }) => {
    await ack();
    const userId = command.user_id;

    const txns = await convex.query(api.transactions.list, { userId });
    if (!txns || txns.length === 0) {
      await respond({
        response_type: 'ephemeral',
        text: "No transactions found. Either you're new or we lost them. Both equally likely.",
      });
      return;
    }

    const lines = txns.map((t) => {
      const sign = t.amount >= 0 ? '+' : '';
      const date = new Date(t.createdAt).toLocaleDateString();
      return `${date}  ${sign}${formatMoney(Math.abs(t.amount))}${t.amount < 0 ? ' ⬇️' : ' ⬆️'}  ${t.description}  _(bal: ${formatMoney(t.balanceAfter)})_`;
    });

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Transaction History' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: lines.join('\n'),
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '_Some transactions may be missing. Or invented. Hard to say._' },
          ],
        },
      ],
    });
  });

  // /south-loan - Apply for a loan (spoiler: denied)
  app.command('/south-loan', async ({ command, ack, respond }) => {
    await ack();
    const amount = parseFloat(command.text.trim()) || 1000;

    const denialReasons = [
      "Your vibes were off.",
      "Our magic 8-ball said 'Ask again never'.",
      "We checked your horoscope. Mercury is in retrograde.",
      "Your account number has too many vowels.",
      "The loan officer is on their 47th coffee break.",
      "We don't actually have any money either.",
      "You asked too politely. Suspicious.",
      "Your credit score is a mood, and that mood is 'no'.",
      "We flipped a coin. It landed on its edge. That means no.",
      "The computer said no.",
      "We ran your application through our advanced AI. It laughed.",
      "Insufficient swagger.",
    ];
    const reason = denialReasons[Math.floor(Math.random() * denialReasons.length)];

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Loan Application Result' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Requested amount:* ${formatMoney(amount)}\n*Status:* :x: *DENIED*\n*Reason:* ${reason}\n\n_Processing time: 0.003 seconds. That's how long it took us to not care._`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Appeal (do not press)' },
              action_id: 'loan_appeal',
            },
          ],
        },
      ],
    });
  });

  // Handle the loan appeal button
  app.action('loan_appeal', async ({ ack, respond }) => {
    await ack();
    await respond({
      response_type: 'ephemeral',
      text: "We told you not to press that. Application denied again. And now you have a warning on your account.",
    });
  });

  // /south-mystery-fee - Charge yourself a mystery fee (why would you)
  app.command('/south-mystery-fee', async ({ command, ack, respond }) => {
    await ack();
    const userId = command.user_id;
    const fee = Math.round((Math.random() * 0.49 + 0.01) * 100) / 100;
    const desc = randomFee();

    const result = await convex.mutation(api.accounts.chargeFee, {
      userId,
      amount: fee,
      description: desc,
    });

    if (result === null) {
      await respond({ response_type: 'ephemeral', text: "No account to charge. Lucky you." });
      return;
    }

    await respond({
      response_type: 'ephemeral',
      text: `You've been charged *${formatMoney(fee)}* for: _${desc}_\n\nNew balance: ${formatMoney(result)}\n\nYou literally asked for this.`,
    });
  });
}

module.exports = { registerBankingCommands };
