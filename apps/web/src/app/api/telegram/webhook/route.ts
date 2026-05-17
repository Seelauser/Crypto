import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Telegram Bot API sends updates to this endpoint
// Set via: https://api.telegram.org/bot{TOKEN}/setWebhook?url={BASE_URL}/api/telegram/webhook

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string; first_name?: string };
    chat: { id: number; type: string };
    text?: string;
  };
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

export async function POST(req: NextRequest) {
  // Verify secret header Telegram sends (optional but recommended)
  const secretToken = req.headers.get('x-telegram-bot-api-secret-token');
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update: TelegramUpdate = await req.json().catch(() => ({}));
  if (!update.message) return NextResponse.json({ ok: true });

  const { message } = update;
  const chatId = message.chat.id;
  const text = message.text ?? '';

  // Handle /start {token} command
  if (text.startsWith('/start ')) {
    const token = text.split(' ')[1]?.trim();
    if (!token) {
      await sendMessage(chatId, '❌ Invalid link. Please generate a new link from your OrderFlow settings.');
      return NextResponse.json({ ok: true });
    }

    // Find channel with this pending token
    const channel = await db.notificationChannel.findFirst({
      where: { kind: 'telegram', verified: false },
    });

    if (!channel) {
      await sendMessage(chatId, '❌ Link not found or expired. Please generate a new one from settings.');
      return NextResponse.json({ ok: true });
    }

    const config = channel.config as Record<string, string>;
    if (config.pendingToken !== token) {
      await sendMessage(chatId, '❌ Invalid token. Please generate a new link from settings.');
      return NextResponse.json({ ok: true });
    }

    // Verify the connection
    await db.notificationChannel.update({
      where: { id: channel.id },
      data: {
        config: { chatId: chatId.toString(), username: message.from?.username ?? '' },
        verified: true,
      },
    });

    const user = await db.user.findUnique({
      where: { id: channel.userId },
      select: { username: true },
    });

    await sendMessage(
      chatId,
      `✅ <b>OrderFlow connected!</b>\n\nHey ${message.from?.first_name ?? user?.username ?? 'trader'}, you'll now receive signal alerts here.\n\n<i>Not investment advice.</i>`
    );

    return NextResponse.json({ ok: true });
  }

  // Handle /stop command
  if (text === '/stop') {
    await db.notificationChannel.updateMany({
      where: { kind: 'telegram', config: { path: ['chatId'], equals: chatId.toString() } },
      data: { verified: false },
    });
    await sendMessage(chatId, '⏸ OrderFlow notifications paused. Reconnect from your settings to resume.');
    return NextResponse.json({ ok: true });
  }

  // Default response
  await sendMessage(chatId, '📊 <b>OrderFlow Analytics</b>\n\nUse /start {token} to connect your account, or visit your settings page.');
  return NextResponse.json({ ok: true });
}
