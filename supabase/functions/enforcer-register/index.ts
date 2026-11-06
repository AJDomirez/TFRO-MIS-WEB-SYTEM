import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const headers = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json();
    const enforcerId = String(body?.enforcer_id || "").trim().toUpperCase();
    const password = String(body?.password || "");
    const fullName = String(body?.full_name || "").trim().slice(0, 160);
    const contactNumber = String(body?.contact_number || "").trim().slice(0, 40);
    if (!/^TE-[A-Z0-9-]{2,37}$/.test(enforcerId) || !fullName || !contactNumber) {
      return json({ error: "Enter a valid Enforcer ID and complete your name and contact number." }, 400);
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,}/.test(password)) {
      return json({ error: "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol." }, 400);
    }
    if (body?.terms_accepted !== true || !body?.terms_version || !body?.privacy_notice_version) {
      return json({ error: "Accept the Terms of Use and Data Privacy Notice before creating an account." }, 400);
    }

    const projectUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!projectUrl || !serviceRoleKey) return json({ error: "Account creation is temporarily unavailable." }, 500);
    const admin = createClient(projectUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: roster, error: rosterError } = await admin.from("traffic_enforcers")
      .select("id, enforcer_id, full_name, status, user_id")
      .eq("enforcer_id", enforcerId).maybeSingle();
    if (rosterError) throw rosterError;
    if (!roster || roster.status !== "active") return json({ error: "This Enforcer ID is not registered or active. Contact a TFRO Administrator." }, 400);
    if (roster.user_id) return json({ error: "This Enforcer ID is already linked to an account. Sign in with your Enforcer ID or contact an Administrator." }, 409);

    // Supabase Auth requires an email identity. This internal address is derived
    // only from the pre-registered roster ID and never sends or receives mail.
    const loginEmail = `${enforcerId.toLowerCase()}@enforcer.tfro-mis.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role: "traffic_enforcer",
        full_name: fullName,
        contact_number: contactNumber,
        enforcer_id: enforcerId,
        terms_accepted: true,
        terms_version: String(body.terms_version).slice(0, 80),
        privacy_notice_version: String(body.privacy_notice_version).slice(0, 80),
      },
    });
    if (error) {
      console.error("Enforcer account creation failed:", error.message);
      return json({ error: error.message || "The Enforcer account could not be created." }, 400);
    }
    if (!data.user) return json({ error: "The Enforcer account could not be created." }, 500);
    return json({ success: true, login_email: loginEmail }, 201);
  } catch (error) {
    console.error("Enforcer registration failed:", error);
    return json({ error: "Enforcer registration could not be completed. Please try again or contact a TFRO Administrator." }, 500);
  }
});

