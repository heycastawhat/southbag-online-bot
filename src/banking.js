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
        text: "No transactions found. Either you're new or we lost them.",
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
            { type: 'mrkdwn', text: '_Some transactions may be missing. Hard to say._' },
          ],
        },
      ],
    });
  });

  // /south-loan - Take out a loan, check status, repay, or default
  app.command('/south-loan', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;
    const text = command.text.trim();

    if (!text) {
      await respond({
        response_type: 'ephemeral',
        text: "Usage: `/south-loan <amount>` | `/south-loan status` | `/south-loan repay` | `/south-loan default`",
      });
      return;
    }

    const sub = text.toLowerCase();

    if (sub === 'status') {
      const result = await convex.query(api.loans.check, { userId });

      if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }

      if (!result.loan) {
        await respond({ response_type: 'ephemeral', text: "You don't have an active loan. Lucky you. Use `/south-loan <amount>` to change that." });
        return;
      }

      const elapsed = Math.floor((Date.now() - result.loan.takenAt) / 1000);
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);

      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Loan Status' },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Principal:* ${formatMoney(result.loan.principal)}\n*Current interest:* ${formatMoney(result.loan.interest)}\n*Total owed:* ${formatMoney(result.loan.principal + result.loan.interest)}\n*Time since loan:* ${hours}h ${minutes}m\n\n_The interest never sleeps. Neither should your anxiety._`,
            },
          },
        ],
      });
      return;
    }

    if (sub === 'repay') {
      const result = await convex.mutation(api.loans.repay, { userId });

      if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
      if (result.error === 'no_loan') { await respond({ response_type: 'ephemeral', text: "You don't have a loan to repay. Responsible, or just boring?" }); return; }
      if (result.error === 'insufficient') {
        await respond({ response_type: 'ephemeral', text: `You owe ${formatMoney(result.owed)} but only have ${formatMoney(result.balance)}. Maybe rob someone first.` });
        return;
      }

      await notifyBalanceChange(client, convex, api, userId, 'Loan repayment', -result.totalPaid, result.newBalance);

      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Loan Repaid' },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Total paid:* ${formatMoney(result.totalPaid)}\n*Interest paid:* ${formatMoney(result.interestPaid)}\n*New balance:* ${formatMoney(result.newBalance)}\n\n_Debt-free. For now. We'll find a way to fix that._`,
            },
          },
        ],
      });
      return;
    }

    if (sub === 'default') {
      const result = await convex.mutation(api.loans.default, { userId });

      if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
      if (result.error === 'no_loan') { await respond({ response_type: 'ephemeral', text: "You don't have a loan to default on. Can't run from what doesn't exist." }); return; }

      await notifyBalanceChange(client, convex, api, userId, 'Loan default', -result.defaultedAmount, result.newBalance);

      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '💀 Loan Defaulted' },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Defaulted amount:* ${formatMoney(result.defaultedAmount)}\n*Account status:* :ice_cube: *FROZEN*\n\n_Your account has been frozen. Southbag remembers. Southbag always remembers._`,
            },
          },
        ],
      });
      return;
    }

    // Otherwise treat as amount
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      await respond({
        response_type: 'ephemeral',
        text: "Usage: `/south-loan <amount>` | `/south-loan status` | `/south-loan repay` | `/south-loan default`",
      });
      return;
    }

    const result = await convex.mutation(api.loans.take, { userId, amount });

    if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
    if (result.error === 'frozen') { await respond({ response_type: 'ephemeral', text: "Your account is frozen. No loans for you." }); return; }
    if (result.error === 'existing_loan') { await respond({ response_type: 'ephemeral', text: "You already have an active loan. Repay it first with `/south-loan repay` or default with `/south-loan default`." }); return; }
    if (result.error === 'invalid_amount') { await respond({ response_type: 'ephemeral', text: "Invalid loan amount. Try something reasonable. Or don't. We don't care." }); return; }

    await notifyBalanceChange(client, convex, api, userId, 'Loan received', result.principal, result.newBalance);

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Loan Approved (surprisingly)' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Principal:* ${formatMoney(result.principal)}\n*Interest rate:* ${result.interestRate}% per hour\n*New balance:* ${formatMoney(result.newBalance)}\n\n:warning: _Interest accrues every hour. Repay with \`/south-loan repay\` before it spirals. Or don't. We love spirals._`,
          },
        },
      ],
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

  // /south-job - Apply for a job at Southbag
  app.command('/south-job', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;

    const result = await convex.mutation(api.jobs.apply, { userId });

    if (result.error === 'already_employed') {
      await respond({ response_type: 'ephemeral', text: `You already work as *${result.title}*. Use \`/south-work\` to do a shift or \`/south-quit\` if you've had enough.` });
      return;
    }
    if (result.error === 'no_account') {
      await respond({ response_type: 'ephemeral', text: "You need a `/south-open-account` before we can exploit you." });
      return;
    }

    await notifyBalanceChange(client, convex, api, userId, 'Uniform deposit fee', -result.uniformFee, null);

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Welcome to the Southbag Team' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Congratulations. You've been hired as:\n\n*${result.title}*\n*Salary:* ${formatMoney(result.salary)} per shift (before tax)\n*Uniform fee:* -${formatMoney(result.uniformFee)}\n\nUse \`/south-work\` to complete a shift. Don't expect a warm welcome.`,
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '_You were not our first choice. Or our second. Or our third._' },
          ],
        },
      ],
    });
  });

  // /south-work - Do a shift at your job
  app.command('/south-work', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;

    const result = await convex.mutation(api.jobs.work, { userId });

    if (result.error === 'no_job') {
      await respond({ response_type: 'ephemeral', text: "You don't have a job. Use `/south-job` to apply. We're always hiring because everyone quits." });
      return;
    }
    if (result.error === 'no_account') {
      await respond({ response_type: 'ephemeral', text: "No account found. How did you even get hired?" });
      return;
    }
    if (result.error === 'cooldown') {
      await respond({ response_type: 'ephemeral', text: `Your next shift starts in *${result.remaining} seconds*. Even Southbag has labour laws. Barely.` });
      return;
    }

    await notifyBalanceChange(client, convex, api, userId, result.event, result.pay >= 0 ? result.net || result.pay : result.pay, result.newBalance);

    if (result.pay < 0) {
      await respond({
        response_type: 'ephemeral',
        text: `:rotating_light: *Workplace Incident* at your ${result.title} job\n\nYou owe: ${formatMoney(Math.abs(result.pay))}\nNew balance: ${formatMoney(result.newBalance)}\n\n_Maybe don't touch the shredder next time._`,
      });
    } else {
      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Shift Complete' },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Job:* ${result.title}\n*Event:* ${result.event}\n\n*Gross pay:* ${formatMoney(result.gross)}\n*Income tax (40%):* -${formatMoney(result.tax)}\n*Net pay:* ${formatMoney(result.net)}\n\n*New balance:* ${formatMoney(result.newBalance)}`,
            },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: '_Another day, another fraction of a cent._' },
            ],
          },
        ],
      });
    }
  });

  // /south-quit - Quit your job
  app.command('/south-quit', async ({ command, ack, respond }) => {
    await ack();
    const userId = command.user_id;

    const result = await convex.mutation(api.jobs.quit, { userId });

    if (result.error === 'no_job') {
      await respond({ response_type: 'ephemeral', text: "You don't have a job to quit. Living the dream." });
      return;
    }

    await respond({
      response_type: 'ephemeral',
      text: `You have quit your position as *${result.title}*.\n\nExit interview fee: -$0.05\n\n_Don't let the door hit you on the way out. Actually, do. It's funnier._`,
    });
  });

  // /south-coinflip - Bet on heads or tails
  app.command('/south-coinflip', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;
    const parts = command.text.trim().split(/\s+/);
    const bet = parseFloat(parts[0]);
    const call = (parts[1] || '').toLowerCase();

    if (isNaN(bet) || bet <= 0 || !['heads', 'tails'].includes(call)) {
      await respond({ response_type: 'ephemeral', text: "Usage: `/south-coinflip <amount> <heads|tails>`" });
      return;
    }

    const result = await convex.mutation(api.gambling.coinflip, { userId, bet, call });

    if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
    if (result.error === 'frozen') { await respond({ response_type: 'ephemeral', text: "Account frozen. No gambling for you." }); return; }
    if (result.error === 'insufficient') { await respond({ response_type: 'ephemeral', text: `You only have ${formatMoney(result.balance)}. Bet smaller or get richer.` }); return; }

    await notifyBalanceChange(client, convex, api, userId, `Coinflip ${result.won ? 'win' : 'loss'}`, result.net, result.newBalance);

    const emoji = result.result === 'heads' ? ':coin:' : ':coin:';
    await respond({
      response_type: 'ephemeral',
      text: result.won
        ? `${emoji} *${result.result.toUpperCase()}!* You called ${result.call} — you win!\n\nBet: ${formatMoney(result.bet)}\nPayout: ${formatMoney(result.payout)} _(1.8x — house takes its cut)_\nProfit: +${formatMoney(result.net)}\nNew balance: ${formatMoney(result.newBalance)}`
        : `${emoji} *${result.result.toUpperCase()}!* You called ${result.call} — you lose.\n\nLost: ${formatMoney(result.bet)}\nNew balance: ${formatMoney(result.newBalance)}\n\n_The house always wins. Especially this house._`,
    });
  });

  // /south-slots - Spin the slot machine
  app.command('/south-slots', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;
    const bet = parseFloat(command.text.trim());

    if (isNaN(bet) || bet <= 0) {
      await respond({ response_type: 'ephemeral', text: "Usage: `/south-slots <amount>`" });
      return;
    }

    const result = await convex.mutation(api.gambling.slots, { userId, bet });

    if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
    if (result.error === 'frozen') { await respond({ response_type: 'ephemeral', text: "Account frozen." }); return; }
    if (result.error === 'insufficient') { await respond({ response_type: 'ephemeral', text: `You only have ${formatMoney(result.balance)}. That's embarrassing.` }); return; }

    await notifyBalanceChange(client, convex, api, userId, `Slots ${result.won ? 'win' : 'loss'}`, result.net, result.newBalance);

    let outcomeText;
    if (result.multiplier < 0) {
      outcomeText = `*CURSED!* Three skulls. You lose ${formatMoney(Math.abs(result.net))}.\n_The machine laughs at you._`;
    } else if (result.won && result.multiplier >= 5) {
      outcomeText = `*JACKPOT!* ${result.multiplier}x payout!\nProfit: +${formatMoney(result.net)}`;
    } else if (result.won) {
      outcomeText = `Two matching! ${result.multiplier}x payout.\nProfit: +${formatMoney(result.net)}`;
    } else {
      outcomeText = `Nothing. Lost ${formatMoney(result.bet)}.`;
    }

    await respond({
      response_type: 'ephemeral',
      text: `:slot_machine: *[ ${result.reels.join(" | ")} ]*\n\n${outcomeText}\n\nNew balance: ${formatMoney(result.newBalance)}`,
    });
  });

  // /south-gamble - Card games (high risk, high reward)
  app.command('/south-gamble', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;
    const [amountStr, game = "unknown"] = command.text.trim().split(/\s+/, 2);
    const bet = parseFloat(amountStr);

    if (isNaN(bet) || bet <= 0) {
      await respond({ response_type: 'ephemeral', text: "Usage: `/south-gamble <amount> <game>` — e.g. `/south-gamble 100 blackjack`." });
      return;
    }

    // TODO: Implement different card games. For now, fallback to old gamble logic.
    const result = await convex.mutation(api.gambling.gamble, { userId, bet });

    if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
    if (result.error === 'frozen') { await respond({ response_type: 'ephemeral', text: "Account frozen." }); return; }
    if (result.error === 'insufficient') { await respond({ response_type: 'ephemeral', text: `You only have ${formatMoney(result.balance)}. Maybe earn some money first.` }); return; }

    await notifyBalanceChange(client, convex, api, userId, `Card Game (${game}): ${result.outcome}`, result.net, result.newBalance);

    let emoji = ':black_joker:';
    let flavor = '';
    if (result.outcome === 'JACKPOT') { emoji = ':star2:'; flavor = `_Unbelievable luck at ${game}! Southbag will be investigating this._`; }
    else if (result.multiplier >= 3) { flavor = `_Big win in ${game}. Enjoy it while it lasts._`; }
    else if (result.multiplier < 0) { emoji = ':fire:'; flavor = `_You didn't just lose your bet in ${game}. You lost MORE than your bet. Classic Southbag._`; }
    else if (!result.won) { flavor = `_Thank you for your donation to the Southbag executive bonus pool via ${game}._`; }
    else { flavor = `_Not bad at ${game}. We'll get it back._`; }

    await respond({
      response_type: 'ephemeral',
      text: `${emoji} *${result.outcome}* ${result.multiplier > 0 ? `(${result.multiplier}x)` : ''}\n\nGame: ${game}\nBet: ${formatMoney(result.bet)}\n${result.won ? `Payout: ${formatMoney(result.payout)}\nProfit: +${formatMoney(result.net)}` : `Lost: ${formatMoney(Math.abs(result.net))}`}\n\nNew balance: ${formatMoney(result.newBalance)}\n\n${flavor}`,
    });
  });

  // /south-daily - Claim your daily reward
  app.command('/south-daily', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;

    const result = await convex.mutation(api.daily.claim, { userId });

    if (result.error === 'no_account') {
      await respond({ response_type: 'ephemeral', text: "You don't have an account. Use `/south-open-account` first." });
      return;
    }
    if (result.error === 'cooldown') {
      const hours = Math.floor(result.remaining / 3600);
      const minutes = Math.floor((result.remaining % 3600) / 60);
      await respond({ response_type: 'ephemeral', text: `You already claimed today. Come back in *${hours}h ${minutes}m*. Patience is a virtue. Not that Southbag cares about virtues.` });
      return;
    }

    await notifyBalanceChange(client, convex, api, userId, 'Daily reward', result.net, result.newBalance);

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Daily Reward Claimed' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Reward:* ${formatMoney(result.reward)}${result.bonus ? ' :star: *BONUS!*' : ''}\n*Daily claim fee:* -${formatMoney(result.fee)}\n*Net received:* ${formatMoney(result.net)}\n\n*New balance:* ${formatMoney(result.newBalance)}`,
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '_Free money! Well, minus the fee. So not free. Classic Southbag._' },
          ],
        },
      ],
    });
  });

  // /south-crypto - Crypto trading
  app.command('/south-crypto', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;
    const parts = command.text.trim().split(/\s+/);
    const sub = (parts[0] || '').toLowerCase();

    if (sub === 'prices') {
      const prices = await convex.query(api.crypto.getPrices, {});

      const lines = prices.map(c => `• *${c.name}* (${c.symbol}): ${formatMoney(c.price)}`).join('\n');
      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Southbag Crypto Exchange' },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Current Prices:*\n${lines}` },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: '_Prices change based on vibes and nothing else._' },
            ],
          },
        ],
      });
      return;
    }

    if (sub === 'buy') {
      const coin = (parts[1] || '').toUpperCase();
      const amount = parseFloat(parts[2]);

      if (!coin || isNaN(amount) || amount <= 0) {
        await respond({ response_type: 'ephemeral', text: "Usage: `/south-crypto buy <coin> <amount>` — e.g. `/south-crypto buy SBAG 1.00`" });
        return;
      }

      const result = await convex.mutation(api.crypto.buy, { userId, coin, amount });

      if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
      if (result.error === 'frozen') { await respond({ response_type: 'ephemeral', text: "Account frozen. No crypto for you." }); return; }
      if (result.error === 'insufficient') { await respond({ response_type: 'ephemeral', text: `Insufficient funds. You have ${formatMoney(result.balance)}. Try being less poor.` }); return; }
      if (result.error === 'invalid_coin') { await respond({ response_type: 'ephemeral', text: "That coin doesn't exist. We only trade fake coins here, but not *that* fake." }); return; }

      await notifyBalanceChange(client, convex, api, userId, `Bought ${result.coinAmount} ${coin}`, -(amount + result.fee), result.newBalance);

      await respond({
        response_type: 'ephemeral',
        text: `:chart_with_upwards_trend: *Crypto Purchase*\n\nBought: *${result.coinAmount} ${coin}*\nSpent: ${formatMoney(amount)}\nTransaction fee: -${formatMoney(result.fee)}\n\nNew balance: ${formatMoney(result.newBalance)}\n\n_To the moon! (Results may vary. Moon not guaranteed.)_`,
      });
      return;
    }

    if (sub === 'sell') {
      const coin = (parts[1] || '').toUpperCase();

      if (!coin) {
        await respond({ response_type: 'ephemeral', text: "Usage: `/south-crypto sell <coin>` — e.g. `/south-crypto sell SBAG`" });
        return;
      }

      const result = await convex.mutation(api.crypto.sell, { userId, coin });

      if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
      if (result.error === 'frozen') { await respond({ response_type: 'ephemeral', text: "Account frozen." }); return; }
      if (result.error === 'invalid_coin') { await respond({ response_type: 'ephemeral', text: "That coin doesn't exist on our exchange." }); return; }
      if (result.error === 'no_holdings') { await respond({ response_type: 'ephemeral', text: `You don't own any ${coin}. Can't sell what you don't have.` }); return; }

      await notifyBalanceChange(client, convex, api, userId, `Sold ${coin}`, result.proceeds - result.tax, result.newBalance);

      await respond({
        response_type: 'ephemeral',
        text: `:chart_with_downwards_trend: *Crypto Sale*\n\nSold: *${result.amount} ${coin}*\nProceeds: ${formatMoney(result.proceeds)}\nCapital gains tax: -${formatMoney(result.tax)}\n\nNew balance: ${formatMoney(result.newBalance)}\n\n_Diamond hands? More like paper hands. Southbag approves._`,
      });
      return;
    }

    if (sub === 'portfolio') {
      const result = await convex.query(api.crypto.portfolio, { userId });

      if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }

      if (!result.holdings || result.holdings.length === 0) {
        await respond({ response_type: 'ephemeral', text: "Your crypto portfolio is empty. Just like your ambitions." });
        return;
      }

      const lines = result.holdings.map(h => `• *${h.coin}*: ${h.amount} (worth ${formatMoney(h.value)})`).join('\n');
      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Your Crypto Portfolio' },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `${lines}\n\n*Total value:* ${formatMoney(result.totalValue)}` },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: '_Past performance is not indicative of future results. Neither is present performance._' },
            ],
          },
        ],
      });
      return;
    }

    await respond({
      response_type: 'ephemeral',
      text: "Usage: `/south-crypto prices` | `/south-crypto buy <coin> <amount>` | `/south-crypto sell <coin>` | `/south-crypto portfolio`",
    });
  });

  // /south-upgrade - Upgrade your account tier
  app.command('/south-upgrade', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;

    const result = await convex.mutation(api.accounts.upgrade, { userId });

    if (result.error === 'no_account') {
      await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." });
      return;
    }
    if (result.error === 'max_tier') {
      await respond({ response_type: 'ephemeral', text: "You're already at the highest tier. There's nothing left to waste money on. Impressive." });
      return;
    }
    if (result.error === 'insufficient') {
      await respond({ response_type: 'ephemeral', text: `You need ${formatMoney(result.cost)} to upgrade but only have ${formatMoney(result.balance)}. Keep grinding.` });
      return;
    }

    await notifyBalanceChange(client, convex, api, userId, `Account upgrade to ${result.tier}`, -result.cost, result.newBalance);

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Account Upgraded!' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*New tier:* ${result.tier}\n*Cost:* -${formatMoney(result.cost)}\n*New balance:* ${formatMoney(result.newBalance)}\n\n_Congratulations! Your new tier does absolutely nothing different. But it sounds fancier, and that's what banking is all about._`,
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '_Premium mediocrity, now at a premium price._' },
          ],
        },
      ],
    });
  });

  // /south-gift - Gift money to another user
  app.command('/south-gift', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;
    const text = command.text.trim();

    const mentionMatch = text.match(/<@([A-Z0-9]+)(\|[^>]*)?>/);
    if (!mentionMatch) {
      await respond({ response_type: 'ephemeral', text: "Usage: `/south-gift @user <amount>` — e.g. `/south-gift @someone 5.00`" });
      return;
    }

    const recipientId = mentionMatch[1];
    const withoutMention = text.replace(/<@[^>]+>/, '').trim();
    const amount = parseFloat(withoutMention);

    if (isNaN(amount) || amount <= 0) {
      await respond({ response_type: 'ephemeral', text: "Enter a valid amount. `/south-gift @user 5.00`" });
      return;
    }

    const result = await convex.mutation(api.accounts.gift, { senderId: userId, recipientId, amount });

    if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "You don't have an account. `/south-open-account` first." }); return; }
    if (result.error === 'no_recipient') { await respond({ response_type: 'ephemeral', text: "The recipient doesn't have a Southbag account. They're probably better off." }); return; }
    if (result.error === 'self_gift') { await respond({ response_type: 'ephemeral', text: "You can't gift money to yourself. That's just... moving money. With extra fees." }); return; }
    if (result.error === 'insufficient') { await respond({ response_type: 'ephemeral', text: `Insufficient funds. You have ${formatMoney(result.balance)} but need ${formatMoney(result.needed)}. Generosity requires money.` }); return; }

    await notifyBalanceChange(client, convex, api, userId, `Gift to <@${recipientId}>`, -(amount + result.tax), result.senderBalance);
    await notifyBalanceChange(client, convex, api, recipientId, `Gift from <@${userId}>`, result.netReceived, result.recipientBalance);

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Gift Sent!' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Sent:* ${formatMoney(amount)} to <@${recipientId}>\n*Generosity tax:* -${formatMoney(result.tax)}\n*Net received by them:* ${formatMoney(result.netReceived)}\n\n*Your new balance:* ${formatMoney(result.senderBalance)}`,
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '_How generous. Southbag took its cut, of course._' },
          ],
        },
      ],
    });
  });

  // /south-insure - Insurance products
  app.command('/south-insure', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;
    const parts = command.text.trim().split(/\s+/);
    const sub = (parts[0] || '').toLowerCase();

    if (sub === 'buy') {
      const plan = (parts[1] || '').toLowerCase();

      if (!['basic', 'silver', 'gold'].includes(plan)) {
        await respond({ response_type: 'ephemeral', text: "Available plans: `basic`, `silver`, `gold`. Usage: `/south-insure buy <plan>`" });
        return;
      }

      const result = await convex.mutation(api.insurance.purchase, { userId, plan });

      if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
      if (result.error === 'insufficient') { await respond({ response_type: 'ephemeral', text: `You need ${formatMoney(result.cost)} for the ${plan} plan but only have ${formatMoney(result.balance)}. Uninsured it is.` }); return; }
      if (result.error === 'already_insured') { await respond({ response_type: 'ephemeral', text: "You're already insured. One useless policy at a time, please." }); return; }

      await notifyBalanceChange(client, convex, api, userId, `Insurance: ${result.planName}`, -result.premium, result.newBalance);

      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Insurance Purchased' },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Plan:* ${result.planName}\n*Premium:* -${formatMoney(result.premium)}\n*Coverage:* ${result.duration}\n\n*New balance:* ${formatMoney(result.newBalance)}`,
            },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: '_You are now "protected." We use that word very loosely._' },
            ],
          },
        ],
      });
      return;
    }

    if (sub === 'claim') {
      const reason = parts.slice(1).join(' ') || 'unspecified';

      const result = await convex.mutation(api.insurance.claim, { userId, reason });

      if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
      if (result.error === 'no_insurance') { await respond({ response_type: 'ephemeral', text: "You don't have insurance. Buy a plan first with `/south-insure buy <plan>`." }); return; }

      await notifyBalanceChange(client, convex, api, userId, 'Insurance claim processing fee', -result.processingFee, result.newBalance);

      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Insurance Claim — DENIED' },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Your claim:* "${reason}"\n*Status:* :x: *DENIED*\n*Reason:* ${result.denialReason}\n\n*Claim processing fee:* -${formatMoney(result.processingFee)}\n*New balance:* ${formatMoney(result.newBalance)}`,
            },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: '_All claims are denied. It\'s in the fine print. Which doesn\'t exist._' },
            ],
          },
        ],
      });
      return;
    }

    if (sub === 'status') {
      const result = await convex.query(api.insurance.getPlan, { userId });

      if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }

      if (!result.plan) {
        await respond({ response_type: 'ephemeral', text: ":warning: You are currently *uninsured*. Not that insurance would help you here. `/south-insure buy <plan>`" });
        return;
      }

      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Insurance Status' },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Plan:* ${result.plan.name}\n*Status:* Active (for what it's worth)\n*Expires:* ${result.plan.expiry}\n*Claims denied:* ${result.plan.claimsDenied}`,
            },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: '_Your premiums are hard at work funding executive bonuses._' },
            ],
          },
        ],
      });
      return;
    }

    await respond({
      response_type: 'ephemeral',
      text: "Usage: `/south-insure buy <plan>` | `/south-insure claim <reason>` | `/south-insure status`\nPlans: `basic`, `silver`, `gold`",
    });
  });

  // /south-heist - Cooperative vault robbery
  app.command('/south-heist', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;
    const sub = (command.text.trim().split(/\s+/)[0] || '').toLowerCase();

    if (sub === 'start') {
      const result = await convex.mutation(api.heist.start, { userId, channelId });

      if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
      if (result.error) { await respond({ response_type: 'ephemeral', text: `Heist error: ${result.error}` }); return; }

      await respond({
        response_type: 'in_channel',
        text: `:rotating_light: <@${userId}> is planning a *VAULT HEIST*! :rotating_light:\n\nType \`/south-heist join\` to join the crew.\nWhen ready, the organizer types \`/south-heist go\` to execute.\n\n_Fortune favors the bold. Southbag favors nobody._`,
      });
      return;
    }

    if (sub === 'join') {
      const result = await convex.mutation(api.heist.join, { userId, channelId });

      if (result.error === 'no_heist') { await respond({ response_type: 'ephemeral', text: "There's no active heist to join. Someone needs to `/south-heist start` first." }); return; }
      if (result.error === 'already_joined') { await respond({ response_type: 'ephemeral', text: "You're already in the crew. Sit tight." }); return; }
      if (result.error === 'full') { await respond({ response_type: 'ephemeral', text: "The crew is full. Too many cooks spoil the heist." }); return; }
      if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first." }); return; }
      if (result.error) { await respond({ response_type: 'ephemeral', text: `Heist error: ${result.error}` }); return; }

      await respond({
        response_type: 'in_channel',
        text: `:bust_in_silhouette: <@${userId}> joined the heist crew! *${result.participantCount}* members ready.\n\n_More people = bigger vault. Also more ways to get caught._`,
      });
      return;
    }

    if (sub === 'go') {
      const result = await convex.mutation(api.heist.execute, { userId, channelId });

      if (result.error === 'not_starter') { await respond({ response_type: 'ephemeral', text: "Only the heist organizer can execute the heist." }); return; }
      if (result.error === 'not_enough') { await respond({ response_type: 'ephemeral', text: "Not enough crew members. You need more people. `/south-heist join`" }); return; }
      if (result.error === 'no_heist') { await respond({ response_type: 'ephemeral', text: "There's no active heist. `/south-heist start` one first." }); return; }
      if (result.error) { await respond({ response_type: 'ephemeral', text: `Heist error: ${result.error}` }); return; }

      if (result.success) {
        const participantLines = result.participants.map(
          p => `• <@${p.userId}>: +${formatMoney(p.share)}`
        ).join('\n');

        for (const p of result.participants) {
          await notifyBalanceChange(client, convex, api, p.userId, 'Vault heist payout', p.share, p.newBalance);
        }

        await respond({
          response_type: 'in_channel',
          text: `:moneybag: *THE HEIST WAS A SUCCESS!* :moneybag:\n\n*Vault payout:* ${formatMoney(result.totalPayout)}\n\n*Crew shares:*\n${participantLines}\n\n_Southbag will be reviewing the security tapes. Eventually._`,
        });
      } else {
        const participantLines = result.participants.map(
          p => `• <@${p.userId}>: -${formatMoney(p.fine)}`
        ).join('\n');

        for (const p of result.participants) {
          await notifyBalanceChange(client, convex, api, p.userId, 'Heist failure fine', -p.fine, p.newBalance);
        }

        await respond({
          response_type: 'in_channel',
          text: `:oncoming_police_car: *THE HEIST FAILED!* :oncoming_police_car:\n\nThe crew got caught. Everyone pays.\n\n*Fines:*\n${participantLines}\n\n_Crime doesn't pay. Except when it does. Which is not now._`,
        });
      }
      return;
    }

    await respond({
      response_type: 'ephemeral',
      text: "Usage: `/south-heist start` | `/south-heist join` | `/south-heist go`",
    });
  });

  // /south-beg - Beg for money
  app.command('/south-beg', async ({ command, ack, respond, client }) => {
    await ack();
    const userId = command.user_id;

    const result = await convex.mutation(api.beg.beg, { userId });

    if (result.error === 'no_account') { await respond({ response_type: 'ephemeral', text: "No account. `/south-open-account` first. Even beggars need paperwork." }); return; }
    if (result.error === 'cooldown') {
      await respond({ response_type: 'ephemeral', text: `You already begged recently. Try again in *${result.remaining} seconds*. Have some dignity.` });
      return;
    }
    if (result.error) { await respond({ response_type: 'ephemeral', text: `Error: ${result.error}` }); return; }

    let message;
    switch (result.type) {
      case 'denied':
        message = `:no_entry_sign: You held out your hand. The teller looked at you, laughed, and walked away.\n\n*Received:* nothing. Absolutely nothing.`;
        break;
      case 'tiny':
        message = `:coin: A teller flicked a coin at you. It bounced off your forehead.\n\n*Received:* ${formatMoney(result.amount)}\n*New balance:* ${formatMoney(result.newBalance)}`;
        break;
      case 'decent':
        message = `:moneybag: Someone took pity on you and tossed some cash your way.\n\n*Received:* ${formatMoney(result.amount)}\n*New balance:* ${formatMoney(result.newBalance)}`;
        break;
      case 'reverse':
        message = `:rotating_light: YOU got charged for begging in the lobby. Security was called.\n\n*Lost:* ${formatMoney(Math.abs(result.amount))}\n*New balance:* ${formatMoney(result.newBalance)}`;
        break;
      case 'jackpot':
        message = `:star2: The teller felt genuinely sorry for you. That's never happened before.\n\n*Received:* ${formatMoney(result.amount)}\n*New balance:* ${formatMoney(result.newBalance)}`;
        break;
      default:
        message = `Something happened. You got ${formatMoney(result.amount)}.\n*New balance:* ${formatMoney(result.newBalance)}`;
    }

    if (result.type !== 'denied') {
      await notifyBalanceChange(client, convex, api, userId, 'Begging', result.amount, result.newBalance);
    }

    await respond({
      response_type: 'ephemeral',
      text: message,
    });
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
