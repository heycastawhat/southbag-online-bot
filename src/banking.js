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
