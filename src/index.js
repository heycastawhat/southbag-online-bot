const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');
const { chat } = require('./ai');
const { parseCommands, executeCommands } = require('./commands');
const { SYSTEM_PROMPT } = require('./prompt');
const { registerBankingCommands, notifyBalanceChange } = require('./banking');
const { registerAppHome } = require('./home');

const ALLOWED_CHANNEL = 'C0AH7GB4V6X';

// --- Slack request verification ---
async function verifySlackRequest(signingSecret, headers, rawBody) {
  const timestamp = headers.get('x-slack-request-timestamp');
  if (!timestamp) return false;
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBasestring));
  const hex = [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, '0')).join('');
  const computed = `v0=${hex}`;
  const expected = headers.get('x-slack-signature');
  return computed === expected;
}

// --- Slack Web API client shim ---
function createSlackClient(botToken) {
  async function slackApi(method, body) {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  return {
    users: {
      info: (opts) => slackApi('users.info', opts),
    },
    chat: {
      postMessage: (opts) => slackApi('chat.postMessage', opts),
      postEphemeral: (opts) => slackApi('chat.postEphemeral', opts),
    },
    reactions: {
      add: (opts) => slackApi('reactions.add', opts),
    },
    views: {
      publish: (opts) => slackApi('views.publish', opts),
    },
  };
}

// --- Command registry (mimics Bolt's app.command) ---
function createCommandRegistry() {
  const commands = {};
  return {
    command: (name, handler) => { commands[name] = handler; },
    event: () => {}, // no-op, events handled separately
    getHandler: (name) => commands[name],
  };
}

// --- Main handler ---
async function handleMessage(event, env) {
  const client = createSlackClient(env.SLACK_BOT_TOKEN);
  const convex = new ConvexHttpClient(env.CONVEX_URL);

  // Ignore bot messages
  if (event.bot_id || event.subtype) return;

  // In channels, only respond in the allowed channel
  const isDM = event.channel_type === 'im';
  if (!isDM && event.channel !== ALLOWED_CHANNEL) return;

  const channelId = event.channel;
  const threadTs = event.thread_ts || event.ts;
  const userId = event.user;

  const say = async (opts) => {
    if (typeof opts === 'string') opts = { text: opts, channel: channelId };
    await client.chat.postMessage({ channel: channelId, ...opts });
  };

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
    const aiResponse = await chat(messages, env);

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

module.exports = {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Southbag Support Bot is running', { status: 200 });
    }

    const rawBody = await request.text();

    // Verify Slack signature
    const valid = await verifySlackRequest(env.SLACK_SIGNING_SECRET, request.headers, rawBody);
    if (!valid) {
      return new Response('Invalid signature', { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';

    // Handle JSON payloads (Events API)
    if (contentType.includes('application/json')) {
      const payload = JSON.parse(rawBody);

      // URL verification challenge
      if (payload.type === 'url_verification') {
        return new Response(JSON.stringify({ challenge: payload.challenge }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Event callbacks
      if (payload.type === 'event_callback') {
        const event = payload.event;

        // Acknowledge immediately, process in background
        ctx.waitUntil((async () => {
          try {
            if (event.type === 'app_mention') {
              await handleMessage(event, env);
            } else if (event.type === 'message') {
              if (event.channel_type === 'im') {
                await handleMessage(event, env);
              }
              if (event.channel === ALLOWED_CHANNEL && event.thread_ts && !event.bot_id && !event.subtype) {
                await handleMessage(event, env);
              }
            } else if (event.type === 'app_home_opened') {
              // Handle App Home
              if (event.tab === 'home') {
                const convex = new ConvexHttpClient(env.CONVEX_URL);
                const client = createSlackClient(env.SLACK_BOT_TOKEN);
                const userId = event.user;

                const [account, job, loan, transactions, crypto, insurance] = await Promise.all([
                  convex.query(api.accounts.get, { userId }).catch(() => null),
                  convex.query(api.jobs.getJob, { userId }).catch(() => null),
                  convex.query(api.loans.check, { userId }).catch(() => null),
                  convex.query(api.transactions.list, { userId }).catch(() => []),
                  convex.query(api.crypto.portfolio, { userId }).catch(() => null),
                  convex.query(api.insurance.getPlan, { userId }).catch(() => null),
                ]);

                const { buildHomeBlocks } = require('./home');
                const blocks = buildHomeBlocks(account, job, loan, transactions, crypto, insurance);

                await client.views.publish({
                  user_id: userId,
                  view: { type: 'home', blocks },
                });
              }
            }
          } catch (err) {
            console.error('Error handling event:', err);
          }
        })());

        return new Response('', { status: 200 });
      }
    }

    // Handle form-urlencoded payloads (slash commands)
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawBody);
      const commandName = params.get('command');

      if (commandName) {
        const convex = new ConvexHttpClient(env.CONVEX_URL);
        const client = createSlackClient(env.SLACK_BOT_TOKEN);

        const command = {
          command: commandName,
          text: params.get('text') || '',
          user_id: params.get('user_id'),
          channel_id: params.get('channel_id'),
          response_url: params.get('response_url'),
          trigger_id: params.get('trigger_id'),
          team_id: params.get('team_id'),
        };

        // For slash commands, we ack immediately and use response_url for async responses
        const respond = async (opts) => {
          await fetch(command.response_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(opts),
          });
        };

        // Build a Bolt-like app object with command registry
        const app = createCommandRegistry();
        registerBankingCommands(app, convex, api);

        const handler = app.getHandler(commandName);
        if (handler) {
          ctx.waitUntil((async () => {
            try {
              await handler({ command, ack: async () => {}, respond, client });
            } catch (err) {
              console.error(`Error handling command ${commandName}:`, err);
              await respond({ response_type: 'ephemeral', text: 'Something went wrong. Even by Southbag standards.' });
            }
          })());
          return new Response('', { status: 200 });
        }
      }
    }

    return new Response('', { status: 200 });
  },
};
