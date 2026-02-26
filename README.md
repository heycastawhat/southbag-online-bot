# Southbag Online Banking - Slack Bot

A ***deliberately terrible*** customer support Slack bot — the satirical Southbag Online Banking assistant, now in your Slack workspace.

## What is this?

A sarcastic, unhelpful, impatient AI customer support bot for "Southbag Online Banking". It will roast you, put you on hold, generate fake tickets, and generally make your life worse.

## Setup

### 1. Create a Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Enable **Socket Mode** (under Settings)
3. Add **Bot Token Scopes**: `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`, `reactions:write`
4. Enable **Events**: `app_mention`, `message.im`
5. Install the app to your workspace
6. Copy the Bot Token, Signing Secret, and App-Level Token

### 2. Set up Convex
```bash
npx convex dev
```
This will create your Convex project and generate the deployment URL.

### 3. Configure environment
```bash
cp .env.example .env
# Fill in your tokens
```

### 4. Install & run
```bash
npm install
npm run dev
```

### 5. In another terminal, run Convex
```bash
npm run convex:dev
```

## Usage

- **Mention the bot** in any channel: `@Southbag help me with my account`
- **DM the bot** directly for a private support session
- Chat history is stored per-channel/thread in Convex

## Banking Commands

| Command | What it does |
|---------|-------------|
| `/south-open-account [name]` | Opens a Southbag account with a pathetic starting balance |
| `/south-balance` | Checks your balance (and charges you for checking) |
| `/south-deposit <amount>` | Deposits money — only 73% arrives (market conditions) |
| `/south-transfer <amount> <@user>` | Transfers with a 15% fee, processing fee, and breathing fee |
| `/south-transactions` | View your transaction history (mostly fees) |
| `/south-loan <amount>` | Apply for a loan (always denied) |
| `/south-mystery-fee` | Charge yourself a random mystery fee. Why would you. |

> **Note:** When registering slash commands in your Slack app, add all 7 commands above under **Slash Commands** in your app config.

## Special Commands (used by the AI)

The bot can use special commands in its responses:
- `[REDIRECT:url]` - Sends a link
- `[HOLD:seconds]` - Delays the response
- `[DISCONNECT]` - Ends the conversation
- `[POPUP:message]` - Sends an ephemeral message
- `[CONFETTI]` - Celebrates sarcastically
- `[TICKET:number]` - Generates a fake support ticket
- `[SHAKE]` / `[GLITCH]` - Visual frustration

---
*This is satire. Please don't actually build bots like this.*
