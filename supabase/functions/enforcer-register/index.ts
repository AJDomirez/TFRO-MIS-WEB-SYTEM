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
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const fullName = String(body?.full_name || "").trim().slice(0, 160);
    const contactNumber = String(body?.contact_number || "").trim().slice(0, 40);
    if (!/^TE-[A-Z0-9-]{2,37}$/.test(enforcerId) || !/^\S+@\S+\.\S+$/.test(email) || !fullName || !contactNumber) {
      return json({ error: "Enter a valid Enforcer ID, email address, name, and contact number." }, 400);
    }
    if (password.length < 6) {
      return json({ error: "Password must be at least 6 characters." }, 400);
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
    let rosterId = roster?.id;
    let createdRosterEntry = false;
    if (!roster) {
      const { data: createdRoster, error: createRosterError } = await admin.from("traffic_enforcers")
        .insert({
          enforcer_id: enforcerId,
          full_name: fullName,
          email,
          contact_number: contactNumber,
          status: "active",
        })
        .select("id")
        .single();
      if (createRosterError) {
        if (createRosterError.code === "23505") {
          return json({ error: "This Enforcer ID is already being registered. Please try signing in or contact an Administrator." }, 409);
        }
        throw createRosterError;
      }
      rosterId = createdRoster.id;
      createdRosterEntry = true;
    } else if (roster.status !== "active") {
      return json({ error: "This Enforcer ID is inactive or suspended. Contact a TFRO Administrator." }, 400);
    }
    if (roster?.user_id) return json({ error: "This Enforcer ID is already linked to an account. Sign in with its registered email or contact an Administrator." }, 409);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "traffic_enforcer",
        full_name: fullName,
        contact_number: contactNumber,
        enforcer_id: enforcerId,
        email,
        terms_accepted: true,
        terms_version: String(body.terms_version).slice(0, 80),
        privacy_notice_version: String(body.privacy_notice_version).slice(0, 80),
      },
    });
    if (error) {
      if (createdRosterEntry) {
        await admin.from("traffic_enforcers").delete().eq("id", rosterId).is("user_id", null);
      }
      console.error("Enforcer account creation failed:", error.message);
      return json({ error: error.message || "The Enforcer account could not be created." }, 400);
    }
    if (!data.user) {
      if (createdRosterEntry) {
        await admin.from("traffic_enforcers").delete().eq("id", rosterId).is("user_id", null);
      }
      return json({ error: "The Enforcer account could not be created." }, 500);
    }
    return json({ success: true, login_email: email }, 201);
  } catch (error) {
    console.error("Enforcer registration failed:", error);
    return json({ error: "Enforcer registration could not be completed. Please try again or contact a TFRO Administrator." }, 500);
  }
});

