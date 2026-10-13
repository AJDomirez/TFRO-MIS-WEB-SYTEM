import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const sender = Deno.env.get("TFRO_EMAIL_FROM") || "TFRO MIS <onboarding@resend.dev>";
    if (!resendKey) return json({ error: "Approval email is queued, but RESEND_API_KEY is not configured." }, 503);

    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
    const { data: profile } = await caller.from("profiles").select("role").eq("id", userData.user.id).single();
    if (!["admin", "staff"].includes(profile?.role)) return json({ error: "Forbidden" }, 403);

    const { renewal_id } = await req.json();
    const admin = createClient(url, serviceKey);
    const { data: email, error: loadError } = await admin.from("email_outbox").select("*")
      .eq("event_type", "renewal_approved").eq("related_record_id", renewal_id).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (loadError) throw loadError;
    if (!email) return json({ status: "nothing_pending" });

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender, to: [email.recipient_email], subject: email.subject, html: email.html_body }),
    });
    const result = await send.json();
    if (!send.ok) {
      await admin.from("email_outbox").update({ status: "failed", error_message: JSON.stringify(result) }).eq("id", email.id);
      return json({ error: "Email provider rejected the message", detail: result }, 502);
    }
    await admin.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), error_message: null }).eq("id", email.id);
    return json({ status: "sent" });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
