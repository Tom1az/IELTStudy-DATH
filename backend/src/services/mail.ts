// Sends transactional email (password reset links) through Brevo's HTTP API, not SMTP, so it works
// on hosts that block SMTP ports (Render's free tier). Configure with MAIL_API_KEY and MAIL_FROM.
// Without MAIL_API_KEY (development) the message is only written to the server log, and in tests
// it goes to `outbox`, so a test can read the link.

export type Mail = { to: string; subject: string; text: string; html?: string };

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10_000;

// Mail "sent" during a test run (NODE_ENV=test). Tests empty it themselves.
export const outbox: Mail[] = [];

// Where the frontend runs, for links inside emails (e.g. https://ieltstudy.vercel.app)
export const appUrl = () =>
  (process.env.APP_URL?.trim() || "http://localhost:3001").replace(/\/$/, "");

export const sendMail = async (mail: Mail) => {
  if (process.env.NODE_ENV === "test") {
    outbox.push(mail);
    return;
  }

  const apiKey = process.env.MAIL_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.log(`[mail] MAIL_API_KEY or MAIL_FROM is not set, so not sending. To: ${mail.to}\n` +
      `Subject: ${mail.subject}\n${mail.text}`);
    return;
  }

  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: from, name: process.env.MAIL_FROM_NAME?.trim() || "IELTStudy" },
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html ?? `<p>${escapeHtml(mail.text).replace(/\n/g, "<br>")}</p>`,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    // The caller decides whether this matters; the reset endpoint still answers 200
    throw new Error(`Brevo answered ${res.status}: ${await res.text().catch(() => "")}`);
  }
};

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
