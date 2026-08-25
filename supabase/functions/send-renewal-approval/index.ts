+import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

Deno.serve(async (req) => {
  const headers = { "Content-Type": "application/json" };
  try {
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
    const authHeader = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const sender = Deno.env.get("TFRO_EMAIL_FROM") || "TFRO MIS <onboarding@resend.dev>";
    if (!resendKey) return new Response(JSON.stringify({ error: "Approval email is queued, but RESEND_API_KEY is not configured." }), { status: 503, headers });

    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    const { data: profile } = await caller.from("profiles").select("role").eq("id", userData.user.id).single();
    if (!["admin", "staff"].includes(profile?.role)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });

    const { renewal_id } = await req.json();
    const admin = createClient(url, serviceKey);
    const { data: email, error: loadError } = await admin.from("email_outbox").select("*")
      .eq("event_type", "renewal_approved").eq("related_record_id", renewal_id).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (loadError) throw loadError;
    if (!email) return new Response(JSON.stringify({ status: "nothing_pending" }), { status: 200, headers });

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender, to: [email.recipient_email], subject: email.subject, html: email.html_body }),
    });
    const result = await send.json();
    if (!send.ok) {
      await admin.from("email_outbox").update({ status: "failed", error_message: JSON.stringify(result) }).eq("id", email.id);
      return new Response(JSON.stringify({ error: "Email provider rejected the message", detail: result }), { status: 502, headers });
    }
    await admin.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), error_message: null }).eq("id", email.id);
    return new Response(JSON.stringify({ status: "sent" }), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers });
  }
});
