/**
 * POST /api/negotiate/email
 * Sends a negotiation email via Resend (preferred) or SendGrid fallback.
 * Returns 503 with hint="copy-to-clipboard" when neither key is set.
 *
 * Required (one of):
 *   RESEND_API_KEY     — resend.com
 *   SENDGRID_API_KEY   — sendgrid.com
 *
 * Body: { to, subject, body, anomalyId? }
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "edge";

async function sendViaResend(
  to: string,
  subject: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Profit Shield <noreply@notifications.attprofit.io>",
      to: [to],
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return {
      ok: false,
      error: `Resend ${res.status}: ${err.slice(0, 200)}`,
    };
  }
  return { ok: true };
}

async function sendViaSendGrid(
  to: string,
  subject: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return { ok: false, error: "SENDGRID_API_KEY not configured" };
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: "noreply@notifications.attprofit.io" },
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return {
      ok: false,
      error: `SendGrid ${res.status}: ${err.slice(0, 200)}`,
    };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      to: string;
      subject: string;
      body: string;
      anomalyId?: string;
    };
    const { to, subject, body: emailBody, anomalyId } = body;

    if (!to || !to.includes("@")) {
      return NextResponse.json(
        { error: "Valid recipient email required" },
        { status: 400 }
      );
    }
    if (!subject || !emailBody) {
      return NextResponse.json(
        { error: "subject and body are required" },
        { status: 400 }
      );
    }

    const hasResend = !!process.env.RESEND_API_KEY;
    const hasSendGrid = !!process.env.SENDGRID_API_KEY;

    if (!hasResend && !hasSendGrid) {
      return NextResponse.json(
        {
          error: "No email provider configured.",
          hint: "copy-to-clipboard",
        },
        { status: 503 }
      );
    }

    let result = hasResend
      ? await sendViaResend(to, subject, emailBody)
      : await sendViaSendGrid(to, subject, emailBody);

    if (!result.ok && hasResend && hasSendGrid) {
      result = await sendViaSendGrid(to, subject, emailBody);
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    // Auto-advance anomaly status
    if (anomalyId) {
      try {
        const supabase = createSupabaseServerClient();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (authUser) {
          const { data: userRow } = await supabase
            .from("users")
            .select("id")
            .eq("auth_user_id", authUser.id)
            .maybeSingle();
          if (userRow?.id) {
            await supabase
              .from("vendor_anomalies")
              .update({ status: "in-progress" })
              .eq("id", anomalyId)
              .eq("user_id", userRow.id)
              .eq("status", "flagged");
          }
        }
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      provider: hasResend ? "resend" : "sendgrid",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email send failed" },
      { status: 500 }
    );
  }
}
