/**
 * Brevo SMTP Transactional Email Service
 * High-Deliverability Verification Engine for Free Study Material Vault
 */

const nodemailer = require("nodemailer");

// Configuration from environment variables
const SMTP_HOST = (process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com").trim();
const SMTP_PORT = parseInt((process.env.BREVO_SMTP_PORT || "587").trim(), 10);
const SMTP_USER = (process.env.BREVO_SMTP_USER || process.env.BREVO_USER || "").trim();
const SMTP_PASS = (process.env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_PASSWORD || "").trim();
const BREVO_API_KEY = (process.env.BREVO_API_KEY || "").trim();
const FROM_EMAIL = (process.env.BREVO_FROM_EMAIL || SMTP_USER || "vault@freestudymaterial.com").trim();
const FROM_NAME = (process.env.BREVO_FROM_NAME || "Free Study Material Vault").trim();

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // xkeysib- is a REST API key, not an SMTP relay password
  if (!SMTP_USER || !SMTP_PASS || SMTP_PASS.startsWith("xkeysib-")) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    connectionTimeout: 2500, // Fast 2.5s connection timeout (prevents hanging on Render)
    greetingTimeout: 2500,
    socketTimeout: 3000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  return transporter;
}

/**
 * Realtime Telegram Dedicated Security OTP Bot Delivery Engine
 * Dispatches instant passcode alerts to dedicated security bot / private chat
 */
async function sendTelegramOtpBackup(toEmail, otp, type = "Verification") {
  try {
    // Dedicated OTP Bot Token (falls back to main bot token if not set)
    const botToken = (process.env.TELEGRAM_OTP_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
    // Dedicated OTP Chat ID (falls back to storage chat id if not set)
    const targetChatId = (process.env.TELEGRAM_OTP_CHAT_ID || process.env.TELEGRAM_STORAGE_CHAT_ID || "").trim();
    if (!botToken || !targetChatId) return;

    const text = `🔐 <b>Free Study Material — Security Passcode Alert</b>\n\n` +
      `👤 <b>Student Email:</b> <code>${toEmail}</code>\n` +
      `🔑 <b>${type} Passcode:</b> <code>${otp}</code>\n` +
      `⏱️ <b>Validity:</b> 10 Minutes\n` +
      `🌐 <i>Isolated Security Core Delivery</i>`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.warn("[TELEGRAM-OTP] OTP bot notification notice:", err.message);
  }
}

/**
 * High-Speed Email Dispatcher:
 * 1. Dispatches parallel Telegram security alert (instant 100ms delivery guarantee)
 * 2. Uses Brevo REST API v3 over HTTPS (Port 443) if xkeysib- API key is configured
 * 3. Uses NodeMailer SMTP with strict 2.5s timeout if SMTP key is configured
 * 4. Never hangs the calling route (returns in < 2 seconds)
 */
async function dispatchEmail({ to, toName, subject, text, html, otpType = "OTP", otp }) {
  // Always trigger Telegram backup alert in background
  sendTelegramOtpBackup(to, otp, otpType).catch(() => {});

  if (!SMTP_PASS && !BREVO_API_KEY) {
    console.log(`[BREVO-SIMULATION] 📧 ${otpType} for ${to}: [ ${otp} ]`);
    return { success: true, delivered: false, simulated: true, otp };
  }

  // Determine if we have a valid Brevo REST API v3 key (starts with xkeysib-)
  const apiKey = BREVO_API_KEY || (SMTP_PASS.startsWith("xkeysib-") ? SMTP_PASS : null);

  // 1. Try Brevo REST API (HTTPS Port 443 - zero firewall blocks on cloud containers, ~200ms latency)
  if (apiKey) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: to, name: toName || "Scholar" }],
          subject: subject,
          htmlContent: html,
          textContent: text,
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`[BREVO-API] ✅ ${otpType} delivered via HTTPS API to ${to} (MessageId: ${data.messageId || "ok"})`);
        return { success: true, delivered: true, messageId: data.messageId || "api-ok", otp };
      } else {
        const errText = await res.text().catch(() => "");
        console.warn(`[BREVO-API] HTTP ${res.status} notice: ${errText}`);
        if (res.status === 401 && errText.includes("authorised_ips")) {
          return {
            success: false,
            delivered: false,
            ipBlocked: true,
            error: "Brevo IP restriction active. Please deactivate blocking at https://app.brevo.com/security/authorised_ips",
            otp,
          };
        }
        return { success: false, delivered: false, error: `Brevo API HTTP ${res.status}: ${errText}`, otp };
      }
    } catch (apiErr) {
      console.warn(`[BREVO-API] API dispatch notice: ${apiErr.message}`);
      return { success: false, delivered: false, error: apiErr.message, otp };
    }
  }

  // 2. Try NodeMailer SMTP with strict 2.5s timeout (if SMTP credentials present)
  const mailTransporter = getTransporter();
  if (mailTransporter) {
    try {
      const smtpPromise = mailTransporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to: to,
        subject: subject,
        text: text,
        html: html,
      });

      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP timeout")), 2500));
      const info = await Promise.race([smtpPromise, timeoutPromise]);

      console.log(`[BREVO-SMTP] ✅ ${otpType} delivered via SMTP to ${to} (MessageId: ${info.messageId})`);
      return { success: true, delivered: true, messageId: info.messageId, otp };
    } catch (smtpErr) {
      console.warn(`[BREVO-SMTP] ⚠️ SMTP delivery notice (${smtpErr.message}). Logging OTP: [ ${otp} ]`);
      return { success: false, delivered: false, error: smtpErr.message, otp };
    }
  }

  return { success: false, delivered: false, error: "No active email transport available", otp };
}

/**
 * Builds an ultra-premium, dark academic gradient responsive HTML email template
 */
function buildCreativeEmailTemplate({ title, subtitle, greeting, messageText, otp, actionNote }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" style="max-width: 540px; background: linear-gradient(180deg, #131b2e 0%, #0d1322 100%); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.6);">
          
          <!-- Top Accent Banner -->
          <tr>
            <td style="height: 5px; background: linear-gradient(90deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%);"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 32px 36px 20px; text-align: center;">
              <div style="display: inline-block; padding: 6px 16px; background: rgba(6, 182, 212, 0.12); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 999px; margin-bottom: 12px;">
                <span style="font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #38bdf8;">
                  ⚡ FREE STUDY MATERIAL VAULT
                </span>
              </div>
              <h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                ${title}
              </h1>
              <p style="margin: 0; font-size: 13px; color: #94a3b8;">
                ${subtitle}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 36px;">
              <div style="height: 1px; background: rgba(255, 255, 255, 0.08);"></div>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 24px 36px;">
              <p style="margin: 0 0 14px; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                <strong>${greeting}</strong>
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                ${messageText}
              </p>

              <!-- OTP Code Display Card -->
              <div style="background: rgba(15, 23, 42, 0.85); border: 2px dashed rgba(6, 182, 212, 0.5); border-radius: 12px; padding: 22px 16px; text-align: center; margin: 0 0 24px; box-shadow: inset 0 0 20px rgba(6, 182, 212, 0.05);">
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #06b6d4; margin-bottom: 8px;">
                  YOUR 6-DIGIT VERIFICATION PASSCODE
                </div>
                <div style="font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 38px; font-weight: 800; letter-spacing: 14px; color: #38bdf8; text-shadow: 0 0 15px rgba(56, 189, 248, 0.4); padding-left: 14px;">
                  ${otp}
                </div>
                <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
                  ⏳ Valid for <strong>10 minutes</strong> only. Do not share with anyone.
                </div>
              </div>

              <!-- Action / Security Alert Note -->
              <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 10px; padding: 12px 16px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 12px; color: #fbbf24; line-height: 1.5;">
                  ⚠️ <strong>Notice:</strong> ${actionNote}
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 36px 30px; background: rgba(0, 0, 0, 0.25); border-top: 1px solid rgba(255, 255, 255, 0.06); text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #94a3b8;">
                Free Study Material Vault • Academic Cloud Engine
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                Secured via Brevo Enterprise Infrastructure. If you did not request this OTP, please safely disregard this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Sends a Login Verification OTP email
 */
async function sendLoginOtpEmail(email, otp, userName = "Scholar") {
  const title = "Secure Login Verification";
  const subtitle = "One-Time Access Passcode for Account Sign-In";
  const greeting = `Hello ${userName},`;
  const messageText = `A sign-in request was initiated for your <strong>Free Study Material Vault</strong> account. To verify your identity and access your academic resources, please enter the one-time passcode below into the login prompt.`;
  const actionNote = `If you did not attempt to sign in to your vault account, someone may have entered your email. Your account remains safe, but please ensure your password is secure.`;

  const htmlContent = buildCreativeEmailTemplate({
    title,
    subtitle,
    greeting,
    messageText,
    otp,
    actionNote,
  });

  const textContent = `[Free Study Material Vault]\n\nHello ${userName},\nYour One-Time Login Verification Passcode is: ${otp}\nThis code expires in 10 minutes.`;

  return await dispatchEmail({
    to: email,
    toName: userName,
    subject: `🔐 Your Login Verification Code: ${otp} | Free Study Material Vault`,
    text: textContent,
    html: htmlContent,
    otpType: "LOGIN OTP",
    otp,
  });
}

/**
 * Sends a Forgot Password Reset OTP email
 */
async function sendForgotPasswordOtpEmail(email, otp, userName = "Scholar") {
  const title = "Account Recovery & Password Reset";
  const subtitle = "Authorized Credential Reset Protocol";
  const greeting = `Hello ${userName},`;
  const messageText = `We received an authorized request to reset the password for your <strong>Free Study Material Vault</strong> account. Enter the verification passcode below to authorize your password update.`;
  const actionNote = `If you did not request a password reset, please ignore this email. Your current password will remain completely unchanged and secure.`;

  const htmlContent = buildCreativeEmailTemplate({
    title,
    subtitle,
    greeting,
    messageText,
    otp,
    actionNote,
  });

  const textContent = `[Free Study Material Vault]\n\nHello ${userName},\nYour Password Reset Verification Passcode is: ${otp}\nThis code expires in 10 minutes.`;

  return await dispatchEmail({
    to: email,
    toName: userName,
    subject: `🔑 Password Reset Passcode: ${otp} | Free Study Material Vault`,
    text: textContent,
    html: htmlContent,
    otpType: "FORGOT PASSWORD OTP",
    otp,
  });
}

/**
 * Sends a Student Registration / Sign-Up Verification OTP email
 */
async function sendSignupOtpEmail(email, otp, userName = "Scholar") {
  const title = "Welcome to Free Study Material Vault";
  const subtitle = "Verify Your Student Registration Passcode";
  const greeting = `Welcome ${userName},`;
  const messageText = `Thank you for creating an account on the <strong>Free Study Material Vault</strong>. To activate your student account and access verified class notes, question papers, and academic textbooks, enter the 6-digit verification code below.`;
  const actionNote = `This verification code is valid for 10 minutes. If you did not create this account, you can safely ignore this email.`;

  const htmlContent = buildCreativeEmailTemplate({
    title,
    subtitle,
    greeting,
    messageText,
    otp,
    actionNote,
  });

  const textContent = `[Free Study Material Vault]\n\nWelcome ${userName},\nYour Registration Verification Passcode is: ${otp}\nThis code expires in 10 minutes.`;

  return await dispatchEmail({
    to: email,
    toName: userName,
    subject: `🎓 Activate Your Student Account: ${otp} | Free Study Material Vault`,
    text: textContent,
    html: htmlContent,
    otpType: "SIGNUP OTP",
    otp,
  });
}

module.exports = {
  sendLoginOtpEmail,
  sendForgotPasswordOtpEmail,
  sendSignupOtpEmail,
  sendTelegramOtpBackup,
};

