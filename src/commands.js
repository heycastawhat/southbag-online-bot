function parseCommands(text) {
  const commands = [];
  let cleanText = text;

  // [REDIRECT:url]
  const redirectMatch = cleanText.match(/\[REDIRECT:(.*?)\]/);
  if (redirectMatch) {
    commands.push({ type: 'redirect', url: redirectMatch[1] });
    cleanText = cleanText.replace(redirectMatch[0], '').trim();
  }

  // [HOLD:seconds]
  const holdMatch = cleanText.match(/\[HOLD:(\d+)\]/);
  if (holdMatch) {
    commands.push({ type: 'hold', seconds: Math.min(parseInt(holdMatch[1]), 120) });
    cleanText = cleanText.replace(holdMatch[0], '').trim();
  }

  // [DISCONNECT]
  if (cleanText.includes('[DISCONNECT]')) {
    commands.push({ type: 'disconnect' });
    cleanText = cleanText.replace('[DISCONNECT]', '').trim();
  }

  // [POPUP:message]
  const popupMatch = cleanText.match(/\[POPUP:(.*?)\]/);
  if (popupMatch) {
    commands.push({ type: 'popup', message: popupMatch[1] });
    cleanText = cleanText.replace(popupMatch[0], '').trim();
  }

  // [SHAKE]
  if (cleanText.includes('[SHAKE]')) {
    commands.push({ type: 'shake' });
    cleanText = cleanText.replace('[SHAKE]', '').trim();
  }

  // [GLITCH]
  if (cleanText.includes('[GLITCH]')) {
    commands.push({ type: 'glitch' });
    cleanText = cleanText.replace('[GLITCH]', '').trim();
  }

  // [CONFETTI]
  if (cleanText.includes('[CONFETTI]')) {
    commands.push({ type: 'confetti' });
    cleanText = cleanText.replace('[CONFETTI]', '').trim();
  }

  // [TICKET:number]
  const ticketMatch = cleanText.match(/\[TICKET:(\d+)\]/);
  if (ticketMatch) {
    commands.push({ type: 'ticket', number: ticketMatch[1] });
    cleanText = cleanText.replace(ticketMatch[0], '').trim();
  }

  // [SLOWTYPE] - just strip it
  if (cleanText.includes('[SLOWTYPE]')) {
    cleanText = cleanText.replace('[SLOWTYPE]', '').trim();
  }

  // [VOLUME:level]
  const volumeMatch = cleanText.match(/\[VOLUME:(.*?)\]/);
  if (volumeMatch) {
    commands.push({ type: 'volume', level: volumeMatch[1] });
    cleanText = cleanText.replace(volumeMatch[0], '').trim();
  }

  return { cleanText, commands };
}

async function executeCommands(commands, say, client, event) {
  for (const cmd of commands) {
    try {
      switch (cmd.type) {
        case 'redirect':
          await say({
            text: `The agent is redirecting you to: ${cmd.url}`,
            thread_ts: event.thread_ts || event.ts
          });
          break;

        case 'hold': {
          await say({
            text: `_Please hold... the agent is consulting their will to live._`,
            thread_ts: event.thread_ts || event.ts
          });
          await new Promise(resolve => setTimeout(resolve, Math.min(cmd.seconds, 30) * 1000));
          break;
        }

        case 'disconnect':
          await say({
            text: `*Connection lost.* The agent has disconnected. :no_entry:`,
            thread_ts: event.thread_ts || event.ts
          });
          try {
            await client.reactions.add({
              channel: event.channel,
              name: 'no_entry',
              timestamp: event.ts
            });
          } catch (e) {}
          break;

        case 'popup':
          try {
            await client.chat.postEphemeral({
              channel: event.channel,
              user: event.user,
              text: `⚠️ ALERT: ${cmd.message}`
            });
          } catch (e) {
            await say({
              text: `⚠️ ALERT: ${cmd.message}`,
              thread_ts: event.thread_ts || event.ts
            });
          }
          break;

        case 'shake':
        case 'glitch': {
          const label = cmd.type === 'shake' ? '* screen shakes violently *' : '* screen glitches *';
          try {
            await client.reactions.add({
              channel: event.channel,
              name: 'warning',
              timestamp: event.ts
            });
          } catch (e) {}
          await say({
            text: `_${label}_`,
            thread_ts: event.thread_ts || event.ts
          });
          break;
        }

        case 'confetti':
          try {
            await client.reactions.add({
              channel: event.channel,
              name: 'tada',
              timestamp: event.ts
            });
          } catch (e) {}
          break;

        case 'ticket':
          await say({
            text: `───────────────\n*SUPPORT TICKET*\n*#${cmd.number}*\nEst. response: Never\n───────────────`,
            thread_ts: event.thread_ts || event.ts
          });
          break;

        case 'volume':
          try {
            await client.reactions.add({
              channel: event.channel,
              name: 'loud_sound',
              timestamp: event.ts
            });
          } catch (e) {}
          break;
      }
    } catch (err) {
      console.error(`Error executing command ${cmd.type}:`, err);
    }
  }
}

module.exports = { parseCommands, executeCommands };
