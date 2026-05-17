const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendTelegramMessage(chatId: string, html: string) {
  const res = await fetch(`${BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram sendMessage failed: ${err}`);
  }
}

export function buildSignalTelegramMessage(params: {
  instrument: string;
  setupName: string;
  price: number;
  triggerType: string;
  explanation: string;
  deepLink: string;
}): string {
  return `<b>📊 ${params.instrument}</b> · ${params.setupName}
<code>${params.triggerType.replace(/_/g, ' ').toUpperCase()}</code> @ <code>${params.price}</code>

${params.explanation}

<a href="${params.deepLink}">View Signal →</a>

<i>Not investment advice · OrderFlow Analytics</i>`;
}
