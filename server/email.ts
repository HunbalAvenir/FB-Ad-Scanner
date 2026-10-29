// Sends through Resend's HTTP API. Needs RESEND_API_KEY and EMAIL_FROM
// (e.g. "Meta Ads QA <noreply@infinitymediala.com>", on a domain verified in Resend).
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Email is not configured (set RESEND_API_KEY and EMAIL_FROM)");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
  });

  if (!res.ok) {
    console.error(`Resend send failed (${res.status}): ${await res.text()}`);
    throw new Error("Failed to send email");
  }
}

function layout(heading: string, body: string, buttonText: string, link: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0a1628">
  <h2 style="margin:0 0 12px">${heading}</h2>
  <p style="margin:0 0 20px;line-height:1.5">${body}</p>
  <a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${buttonText}</a>
  <p style="margin:20px 0 0;font-size:12px;color:#667">Or open this link: ${link}</p>
</div>`;
}

export function inviteEmail(link: string): { subject: string; html: string } {
  return {
    subject: "You've been invited to Meta Ads QA",
    html: layout(
      "You're invited to Meta Ads QA",
      "You've been added to the Meta Ads QA Scanner Portal by Infinity Media. Set your password to get started. This link expires in 7 days.",
      "Set your password",
      link,
    ),
  };
}

export function resetEmail(link: string): { subject: string; html: string } {
  return {
    subject: "Reset your Meta Ads QA password",
    html: layout(
      "Reset your password",
      "Someone asked to reset your Meta Ads QA password. If it was you, use the button below. This link expires in 1 hour. If not, ignore this email.",
      "Reset password",
      link,
    ),
  };
}
