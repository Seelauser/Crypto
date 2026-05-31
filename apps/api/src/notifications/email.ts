import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.EMAIL_FROM ?? 'OrderFlow <notify@orderflow.app>';
const APP_URL = process.env.APP_URL ?? 'https://orderflow.app';

// ─── Signal Alert Email ───────────────────────────────────────────────────────

export async function sendSignalAlertEmail(params: {
  to:          string;
  instrument:  string;
  setupName:   string;
  triggerType: string;
  price:       number;
  explanation: string;
  signalId:    string;
}): Promise<void> {
  const { to, instrument, setupName, triggerType, price, explanation, signalId } = params;
  const deepLink = `${APP_URL}/signals/${signalId}`;
  const triggerLabel = triggerType.replace(/_/g, ' ').toUpperCase();

  await resend.emails.send({
    from:    FROM,
    to,
    subject: `[OrderFlow] ${instrument} — ${triggerLabel}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Inter, sans-serif; background: #0a0a0b; color: #e6e8ee; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 0 auto; padding: 32px 24px; }
    .badge { display: inline-block; background: #13141a; border: 1px solid #1f2128; border-radius: 4px; padding: 2px 8px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #8a8f9b; }
    .instrument { font-size: 22px; font-weight: 700; margin: 0; }
    .price { font-family: 'JetBrains Mono', monospace; color: #22d3ee; font-size: 18px; }
    .explanation { background: #13141a; border-left: 3px solid #22d3ee; padding: 16px; border-radius: 0 4px 4px 0; margin: 20px 0; font-size: 14px; line-height: 1.6; }
    .cta { display: inline-block; background: #22d3ee; color: #0a0a0b; font-weight: 600; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; }
    .footer { margin-top: 32px; font-size: 11px; color: #8a8f9b; border-top: 1px solid #1f2128; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <p class="badge">ORDER FLOW SIGNAL</p>
    <h1 class="instrument">${instrument}</h1>
    <p>Setup: <strong>${setupName}</strong> · Trigger: <span class="badge">${triggerLabel}</span></p>
    <p class="price">Price: ${price.toLocaleString('en-US', { maximumFractionDigits: 8 })}</p>

    <div class="explanation">
      <strong>AI Analysis</strong><br><br>
      ${explanation.replace(/\n/g, '<br>')}
    </div>

    <a href="${deepLink}" class="cta">View Signal Details →</a>

    <div class="footer">
      <p>⚠️ Not investment advice. OrderFlow Analytics provides order flow data and AI-assisted interpretation for educational purposes only. Always conduct your own research before making trading decisions.</p>
      <p><a href="${APP_URL}/settings" style="color:#8a8f9b">Manage notification preferences</a></p>
    </div>
  </div>
</body>
</html>`,
  });
}

// ─── Daily Recap Email ────────────────────────────────────────────────────────

export async function sendDailyRecapEmail(params: {
  to:         string;
  username:   string;
  recapText:  string;
  date:       string;
}): Promise<void> {
  const { to, username, recapText, date } = params;

  await resend.emails.send({
    from:    FROM,
    to,
    subject: `[OrderFlow] Daily Flow Recap — ${date}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Inter, sans-serif; background: #0a0a0b; color: #e6e8ee; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 0 auto; padding: 32px 24px; }
    .badge { display: inline-block; background: #13141a; border: 1px solid #1f2128; border-radius: 4px; padding: 2px 8px; font-size: 12px; color: #8a8f9b; }
    h1 { font-size: 20px; margin: 16px 0 8px; }
    .recap { background: #13141a; border: 1px solid #1f2128; padding: 20px; border-radius: 6px; font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
    .cta { display: inline-block; background: #22d3ee; color: #0a0a0b; font-weight: 600; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; margin-top: 24px; }
    .footer { margin-top: 32px; font-size: 11px; color: #8a8f9b; border-top: 1px solid #1f2128; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <p class="badge">DAILY RECAP · ${date}</p>
    <h1>Good morning, ${username}</h1>
    <p>Here's your AI-powered order flow summary for the day.</p>

    <div class="recap">${recapText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

    <a href="${APP_URL}/dashboard" class="cta">Open Dashboard →</a>

    <div class="footer">
      <p>⚠️ Not investment advice. AI-generated market recaps are for educational purposes only.</p>
      <p><a href="${APP_URL}/settings" style="color:#8a8f9b">Manage notification preferences</a></p>
    </div>
  </div>
</body>
</html>`,
  });
}

// ─── Email Verification ───────────────────────────────────────────────────────

export async function sendVerificationEmail(params: {
  to:    string;
  token: string;
}): Promise<void> {
  const { to, token } = params;
  const verifyUrl = `${APP_URL}/api/auth/verify?token=${token}`;

  await resend.emails.send({
    from:    FROM,
    to,
    subject: 'Verify your OrderFlow account',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Inter, sans-serif; background: #0a0a0b; color: #e6e8ee; margin: 0; padding: 0; }
    .container { max-width: 480px; margin: 0 auto; padding: 48px 24px; text-align: center; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p { color: #8a8f9b; margin: 0 0 24px; }
    .cta { display: inline-block; background: #22d3ee; color: #0a0a0b; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; }
    .note { font-size: 12px; color: #8a8f9b; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Verify your email</h1>
    <p>Click below to verify your email address and activate your OrderFlow account.</p>
    <a href="${verifyUrl}" class="cta">Verify Email →</a>
    <p class="note">Link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
  </div>
</body>
</html>`,
  });
}
