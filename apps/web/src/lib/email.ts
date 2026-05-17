import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? 'OrderFlow <notify@orderflow.app>';
const BASE_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

export async function sendVerificationEmail(
  email: string,
  username: string,
  token: string,
  userId: string
) {
  const link = `${BASE_URL}/api/auth/verify?token=${token}&uid=${userId}`;
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Verify your OrderFlow account',
    html: `
      <div style="background:#0a0a0b;color:#e6e8ee;font-family:Inter,sans-serif;padding:32px;max-width:480px;margin:auto;">
        <h2 style="color:#22d3ee;margin-bottom:16px;">Welcome to OrderFlow, ${username}</h2>
        <p style="color:#8a8f9b;margin-bottom:24px;">Click the button below to verify your email address and activate your account.</p>
        <a href="${link}" style="display:inline-block;background:#22d3ee;color:#0a0a0b;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">Verify Email</a>
        <p style="color:#5a5f6a;margin-top:24px;font-size:12px;">Link expires in 24 hours. If you didn't create an account, ignore this email.</p>
      </div>
    `,
  });
}

export async function sendSignalAlert(params: {
  email: string;
  username: string;
  instrument: string;
  setupName: string;
  explanation: string;
  price: number;
  triggerType: string;
  deepLink: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: params.email,
    subject: `Signal: ${params.instrument} — ${params.setupName}`,
    html: `
      <div style="background:#0a0a0b;color:#e6e8ee;font-family:Inter,sans-serif;padding:32px;max-width:560px;margin:auto;">
        <div style="border-left:3px solid #22d3ee;padding-left:12px;margin-bottom:20px;">
          <h2 style="color:#e6e8ee;margin:0;">${params.instrument}</h2>
          <p style="color:#8a8f9b;margin:4px 0 0;">${params.setupName} · ${params.triggerType.replace('_', ' ')}</p>
        </div>
        <p style="font-family:'JetBrains Mono',monospace;font-size:20px;color:#22d3ee;margin-bottom:16px;">@ ${params.price}</p>
        <p style="color:#e6e8ee;line-height:1.6;margin-bottom:20px;">${params.explanation}</p>
        <a href="${params.deepLink}" style="display:inline-block;background:#22d3ee;color:#0a0a0b;padding:10px 20px;border-radius:6px;font-weight:600;text-decoration:none;">View Signal</a>
        <p style="color:#5a5f6a;margin-top:24px;font-size:11px;">Not investment advice. OrderFlow Analytics.</p>
      </div>
    `,
  });
}

export async function sendDailyRecap(params: {
  email: string;
  username: string;
  recap: string;
  date: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: params.email,
    subject: `Daily Flow Recap — ${params.date}`,
    html: `
      <div style="background:#0a0a0b;color:#e6e8ee;font-family:Inter,sans-serif;padding:32px;max-width:600px;margin:auto;">
        <h2 style="color:#22d3ee;margin-bottom:4px;">Daily Flow Recap</h2>
        <p style="color:#5a5f6a;font-size:12px;margin-bottom:20px;">${params.date}</p>
        <div style="white-space:pre-wrap;line-height:1.7;color:#e6e8ee;">${params.recap}</div>
        <a href="${BASE_URL}/dashboard" style="display:inline-block;margin-top:24px;background:#13141a;border:1px solid #1f2128;color:#e6e8ee;padding:10px 20px;border-radius:6px;text-decoration:none;">Open Dashboard</a>
        <p style="color:#5a5f6a;margin-top:24px;font-size:11px;">Not investment advice. OrderFlow Analytics.</p>
      </div>
    `,
  });
}
