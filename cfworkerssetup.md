# Deploying Southbag Bot to Cloudflare Workers

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Your existing Slack app at [api.slack.com/apps](https://api.slack.com/apps)
- Convex backend already deployed (`npx convex deploy`)

## 1. Install dependencies

```bash
npm install
```

This installs `convex` (runtime) and `wrangler` (dev/deploy tooling).

## 2. Add secrets to Cloudflare

Set each secret using wrangler:

```bash
npx wrangler secret put SLACK_BOT_TOKEN
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put HCAI
npx wrangler secret put CONVEX_URL
```

You'll be prompted to enter each value. Get these from:

| Secret | Where to find it |
|---|---|
| `SLACK_BOT_TOKEN` | Slack App → OAuth & Permissions → Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Slack App → Basic Information → App Credentials → Signing Secret |
| `HCAI` | Your Hack Club AI API key |
| `CONVEX_URL` | Your Convex deployment URL (from `npx convex deploy`) |

## 3. Deploy to Cloudflare Workers

```bash
npm run deploy
```

This runs `npx wrangler deploy` and gives you a URL like:

```
https://southbag-slack-bot.<your-account>.workers.dev
```

## 4. Update your Slack app settings

Go to [api.slack.com/apps](https://api.slack.com/apps) and select your app.

### Disable Socket Mode

1. Go to **Socket Mode** in the sidebar
2. Toggle it **OFF**

### Set the Request URL for Events

1. Go to **Event Subscriptions**
2. Toggle **Enable Events** to **On**
3. Set **Request URL** to your Worker URL:
   ```
   https://southbag-slack-bot.<your-account>.workers.dev
   ```
4. Slack will send a verification challenge — it should show ✅ **Verified**
5. Make sure these bot events are subscribed:
   - `app_mention`
   - `app_home_opened`
   - `message.channels`
   - `message.im`
6. Click **Save Changes**

### Set the Request URL for Slash Commands

For **each** slash command (`/south-balance`, `/south-open-account`, etc.):

1. Go to **Slash Commands**
2. Edit each command
3. Set the **Request URL** to your Worker URL:
   ```
   https://southbag-slack-bot.<your-account>.workers.dev
   ```
4. Save

> **Tip:** If you have many commands, you can use the Slack manifest editor (App Settings → App Manifest) to bulk-update all command URLs at once by adding a `"url"` field to each command in the JSON.

### Set the Interactivity Request URL

1. Go to **Interactivity & Shortcuts**
2. Set the **Request URL** to your Worker URL
3. Save

## 5. Local development

For local testing, create a `.dev.vars` file in the project root (this is wrangler's equivalent of `.env`):

```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
HCAI=your-hcai-key
CONVEX_URL=your-convex-deployment-url
```

Then run:

```bash
npm run dev
```

This starts a local wrangler dev server. To expose it to Slack, use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
npx cloudflared tunnel --url http://localhost:8787
```

Use the generated `https://...trycloudflare.com` URL as your Request URL in Slack while developing.

## What changed from Socket Mode

| Before (Socket Mode) | After (CF Workers HTTP) |
|---|---|
| `@slack/bolt` with WebSocket | Raw `fetch()` handler with Slack Web API |
| `process.env` + `dotenv` | Wrangler secrets / `.dev.vars` |
| `SLACK_APP_TOKEN` needed | **Not needed** (no Socket Mode) |
| Long-running Node.js process | Serverless — runs on request |
| Deployed via Docker / VPS | `npx wrangler deploy` |

## Troubleshooting

- **"Invalid signature" errors**: Make sure `SLACK_SIGNING_SECRET` is correct (not the client secret or verification token)
- **Commands not responding**: Ensure each slash command's Request URL points to your Worker
- **Events not arriving**: Check Event Subscriptions shows "Verified" and the correct URL
- **Timeouts**: CF Workers have a 30s CPU time limit. The `ctx.waitUntil()` pattern is used to process events in the background after immediately acking Slack's request
