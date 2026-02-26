require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { App } = require('@slack/bolt');
const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');
const { chat } = require('./ai');
const { parseCommands, executeCommands } = require('./commands');
const { SYSTEM_PROMPT } = require('./prompt');
const { registerBankingCommands, notifyBalanceChange } = require('./banking');

const ALLOWED_CHANNEL = 'C0AH7GB4V6X';

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Register slash commands for banking
registerBankingCommands(app, convex, api);

async function handleMessage(event, say, client) {
  // Ignore bot messages
  if (event.bot_id || event.subtype) return;

  // In channels, only respond in the allowed channel
  const isDM = event.channel_type === 'im';
  if (!isDM && event.channel !== ALLOWED_CHANNEL) return;

  const channelId = event.channel;
  const threadTs = event.thread_ts || event.ts;
  const userId = event.user;

  // Strip the bot mention from the text
  let userText = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!userText) return;

  // Ignore messages prefixed with ##
  if (userText.startsWith('##')) return;

  // Fetch user's Slack profile for roasting context
  let profileContext = '';
  try {
    const userInfo = await client.users.info({ user: userId });
    const p = userInfo.user.profile || {};
    const tz = userInfo.user.tz_label || userInfo.user.tz || 'Unknown';
    const parts = [];
    if (p.display_name || p.real_name) parts.push(`Name: ${p.display_name || p.real_name}`);
    if (p.title) parts.push(`Title: ${p.title}`);
    if (p.phone) parts.push(`Phone: ${p.phone}`);
    if (p.status_text) parts.push(`Status: "${p.status_text}" ${p.status_emoji || ''}`);
    parts.push(`Timezone: ${tz}`);
    if (p.pronouns) parts.push(`Pronouns: ${p.pronouns}`);
    if (p.skype) parts.push(`Skype: ${p.skype}`);
    if (userInfo.user.is_admin) parts.push('Is a workspace admin');
    if (userInfo.user.is_owner) parts.push('Is the workspace owner');
    profileContext = `\n[USER SLACK PROFILE (use this to roast them): ${parts.join('. ')}]`;
  } catch (e) {}

  // Fetch user's banking info to give the AI context
  let bankingContext = '';
  try {
    const account = await convex.query(api.accounts.getBalance, { userId });
    if (account) {
      bankingContext = `\n[USER BANKING INFO: Account ${account.accountNumber}, Balance: $${account.balance.toFixed(2)}, Status: ${account.status}]`;
    } else {
      bankingContext = '\n[USER HAS NO ACCOUNT - suggest they use /south-open-account if they ask about banking]';
    }
  } catch (e) {}

  // Store user message in Convex
  await convex.mutation(api.messages.store, {
    channelId,
    threadTs,
    role: 'user',
    content: userText,
    userId,
    createdAt: Date.now(),
  });

  // Fetch conversation history from Convex (last 20 messages for context)
  const history = await convex.query(api.messages.getHistory, {
    channelId,
    threadTs,
  });
  const recentHistory = history.slice(-20);

  // Build messages array for the AI
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + profileContext + bankingContext },
    ...recentHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  ];

  try {
    const aiResponse = await chat(messages);

    // Parse special commands from the response
    const { cleanText, commands } = parseCommands(aiResponse);

    // Store assistant message in Convex (clean version)
    await convex.mutation(api.messages.store, {
      channelId,
      threadTs,
      role: 'assistant',
      content: cleanText,
      createdAt: Date.now(),
    });

    // Reply in Slack (in thread)
    if (cleanText) {
      await say({
        text: cleanText,
        thread_ts: threadTs,
      });
    }

    // Execute special commands
    await executeCommands(commands, say, client, event, { convex, api, notifyBalanceChange });
  } catch (err) {
    console.error('Error handling message:', err);
    await say({
      text: "Look, even our systems don't want to deal with you right now. Try again later.",
      thread_ts: threadTs,
    });
  }
}

// Listen for @mentions in channels
app.event('app_mention', async ({ event, say, client }) => {
  await handleMessage(event, say, client);
});

// Listen for DMs and thread replies in the allowed channel
app.event('message', async ({ event, say, client }) => {
  if (event.channel_type === 'im') {
    await handleMessage(event, say, client);
  }
  // Reply to thread messages in the allowed channel (no @mention needed)
  if (event.channel === ALLOWED_CHANNEL && event.thread_ts && !event.bot_id && !event.subtype) {
    await handleMessage(event, say, client);
  }
});

(async () => {
  await app.start();
  console.log('⚡ Southbag Support Bot is running!');
})();
