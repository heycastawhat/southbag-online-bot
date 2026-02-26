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
  app.command('/south-balance', async ({ command, ack, respond, client }) => {
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

    await notifyBalanceChange(client, convex, api, userId, feeDesc, -feeAmount, newBalance);

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
  app.command('/south-transfer', async ({ command, ack, respond, client }) => {
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

    await notifyBalanceChange(client, convex, api, userId, `Transfer to ${recipient}`, -(result.amount + result.fees), result.newBalance);

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

  // /south-deposit - Admin only (U091KE59H5H), deposit into any user's account
  app.command('/south-deposit', async ({ command, ack, respond, client }) => {
    await ack();
    const ADMIN_ID = 'U091KE59H5H';

    if (command.user_id !== ADMIN_ID) {
      await respond({ response_type: 'ephemeral', text: "You don't have permission to deposit. Nice try." });
      return;
    }

    const text = command.text.trim();
    const mentionMatch = text.match(/<@([A-Z0-9]+)(\|[^>]*)?>/);

    // Remove the mention to isolate the amount
    const withoutMention = text.replace(/<@[^>]+>/, '').trim();
    const amount = parseFloat(withoutMention);

    if (!mentionMatch || isNaN(amount) || amount <= 0) {
      await respond({ response_type: 'ephemeral', text: "Usage: `/south-deposit @user <amount>`\nMake sure you select the user from the dropdown when typing @." });
      return;
    }

    const targetUserId = mentionMatch[1];

    if (isNaN(amount) || amount <= 0) {
      await respond({ response_type: 'ephemeral', text: "Enter a valid amount. `/south-deposit @user 10.00`" });
      return;
    }

    const result = await convex.mutation(api.accounts.deposit, { userId: targetUserId, amount });

    if (result.error === 'no_account') {
      await respond({ response_type: 'ephemeral', text: "That user doesn't have an account." });
      return;
    }

    await notifyBalanceChange(client, convex, api, targetUserId, 'Deposit', result.actual - result.fee, result.newBalance);

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
            text: `*Deposited to:* <@${targetUserId}>\n*Requested:* ${formatMoney(result.requested)}\n*Actually deposited:* ${formatMoney(result.actual)} _(adjusted for market conditions)_\n*Convenience fee:* -${formatMoney(result.fee)}\n\n*Their new balance:* ${formatMoney(result.newBalance)}`,
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

  // /south-rob - Rob another user (45% chance of getting caught)
  app.command('/south-rob', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;
    const targetText = command.text.trim();

    // Extract user ID from Slack mention format <@U12345>
    const mentionMatch = targetText.match(/<@([A-Z0-9]+)(\|[^>]*)?>/);
    if (!mentionMatch) {
      await respond({
        response_type: 'ephemeral',
        text: "Usage: `/south-rob @someone` — you need to pick a target, genius.",
      });
      return;
    }

    const victimId = mentionMatch[1];
    const result = await convex.mutation(api.accounts.rob, { robberId: userId, victimId });

    if (result.error === 'self_rob') {
      await respond({ response_type: 'ephemeral', text: "You can't rob yourself. That's just called spending." });
      return;
    }
    if (result.error === 'no_account') {
      await respond({ response_type: 'ephemeral', text: "You need a `/south-open-account` to rob someone. Even criminals need a bank account." });
      return;
    }
    if (result.error === 'frozen') {
      await respond({ response_type: 'ephemeral', text: "Your account is frozen. No heists for you." });
      return;
    }
    if (result.error === 'no_victim') {
      await respond({ response_type: 'ephemeral', text: "They don't have a Southbag account. Can't rob what doesn't exist." });
      return;
    }
    if (result.error === 'victim_broke') {
      await respond({ response_type: 'ephemeral', text: "They're broke. There's nothing to steal. Sad, really." });
      return;
    }

    if (result.success) {
      await notifyBalanceChange(client, convex, api, userId, 'Found money on the ground', result.net, result.robberNewBal);
      await notifyBalanceChange(client, convex, api, result.victimId, 'Mysterious disappearance of funds', -result.stolen, result.victimNewBal);
      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '🔫 Robbery Successful' },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `You robbed <@${result.victimId}>!\n\n*Stolen:* ${formatMoney(result.stolen)}\n*Fencing fee (30%):* -${formatMoney(result.fence)}\n*Net profit:* ${formatMoney(result.net)}\n\n*Your new balance:* ${formatMoney(result.robberNewBal)}`,
            },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: '_Southbag does not condone this. But we do take a cut._' },
            ],
          },
        ],
      });
    } else {
      await notifyBalanceChange(client, convex, api, userId, 'Attempted robbery fine', -result.fine, result.newBalance);
      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '🚨 Caught Red-Handed' },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `You tried to rob <@${result.victimId}> and got *caught*.\n\n*Fine:* -${formatMoney(result.fine)}\n*New balance:* ${formatMoney(result.newBalance)}\n*Account status:* :eyes: suspicious\n\n_Maybe try being less obvious next time._`,
            },
          },
        ],
      });
    }
  });

  // /south-notifs - Toggle balance notifications
  app.command('/south-notifs', async ({ command, ack, respond }) => {
    await ack();
    const userId = command.user_id;

    const result = await convex.mutation(api.accounts.toggleNotifications, { userId });

    if (result === null) {
      await respond({ response_type: 'ephemeral', text: "You don't have an account. `/south-open-account` first." });
      return;
    }

    await respond({
      response_type: 'ephemeral',
      text: result
        ? "Balance notifications *enabled*. You'll get a DM every time your balance changes. Enjoy the anxiety."
        : "Balance notifications *disabled*. Ignorance is bliss.",
    });
  });

  // /south-mystery-fee - Charge yourself a mystery fee (why would you)
  app.command('/south-mystery-fee', async ({ command, ack, respond, client }) => {
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

    await notifyBalanceChange(client, convex, api, userId, desc, -fee, result);

    await respond({
      response_type: 'ephemeral',
      text: `You've been charged *${formatMoney(fee)}* for: _${desc}_\n\nNew balance: ${formatMoney(result)}\n\nYou literally asked for this.`,
    });
  });
}

async function notifyBalanceChange(client, convex, api, userId, description, amount, newBalance) {
  try {
    const notifyUsers = await convex.query(api.accounts.getNotificationUsers, { userIds: [userId] });
    if (notifyUsers.length === 0) return;

    const sign = amount >= 0 ? '+' : '';
    const emoji = amount >= 0 ? ':chart_with_upwards_trend:' : ':chart_with_downwards_trend:';
    await client.chat.postMessage({
      channel: userId,
      text: `${emoji} *Balance Update*\n${description}: ${sign}${formatMoney(Math.abs(amount))}\nNew balance: ${formatMoney(newBalance)}`,
    });
  } catch (e) {}
}

module.exports = { registerBankingCommands, notifyBalanceChange };
