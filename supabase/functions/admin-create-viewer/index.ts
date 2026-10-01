import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const cleanText = (value: unknown, limit: number) => String(value ?? "").trim().slice(0, limit);
const USERNAME_PATTERN = /^[a-z][a-z0-9_.-]{2,31}$/;

async function authenticateHeadAdmin(token: string) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !publishableKey || !serviceRoleKey) throw new Error("Server configuration is incomplete.");
  const callerClient = createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) return { error: "Your session is invalid or expired.", status: 401 };
  const { data: callerProfile, error: profileError } = await adminClient.from("profiles").select("role, full_name").eq("id", callerData.user.id).maybeSingle();
  if (profileError) throw profileError;
  if (callerProfile?.role !== "admin") return { error: "Only Head Administrators can manage Administrator accounts.", status: 403 };
  return { adminClient, caller: callerData.user, callerProfile };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication is required." }, 401);
    const session = await authenticateHeadAdmin(token);
    if ("error" in session) return json({ error: session.error }, session.status);
    const { adminClient, caller, callerProfile } = session;
    const body = await request.json();
    const action = cleanText(body?.action || "create", 20);

    if (action === "list") {
      const { data: profiles, error } = await adminClient.from("profiles").select("id, role, full_name, username, contact_number").in("role", ["admin", "admin_viewer"]).order("role").order("full_name");
      if (error) throw error;
      const accounts = await Promise.all((profiles || []).map(async (profile) => {
        const { data } = await adminClient.auth.admin.getUserById(profile.id);
        return { ...profile, username: profile.username || data.user?.email || "—" };
      }));
      return json({ accounts });
    }

    if (action === "delete") {
      const userId = cleanText(body?.user_id, 64);
      if (!userId || userId === caller.id) return json({ error: "Choose a valid view-only Administrator account." }, 400);
      const { data: target, error: targetError } = await adminClient.from("profiles").select("id, role, full_name, username").eq("id", userId).maybeSingle();
      if (targetError) throw targetError;
      if (!target || target.role !== "admin_viewer") return json({ error: "Only view-only Administrator accounts can be deleted here." }, 409);
      const { error: disableError } = await adminClient.from("profiles").update({ role: "disabled_admin_viewer", username: null }).eq("id", target.id);
      if (disableError) throw disableError;
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(target.id, true);
      if (deleteError) throw deleteError;
      await adminClient.from("audit_logs").insert({ user_id: caller.id, user_name: callerProfile.full_name || "Head Administrator", role: "admin", action: "Deleted view-only Administrator account", action_type: "delete", record: target.full_name || target.username || target.id, description: "Removed view-only Administrator portal access." });
      return json({ success: true });
    }

    if (action !== "create") return json({ error: "Unknown administrator action." }, 400);
    const fullName = cleanText(body?.full_name, 120);
    const username = cleanText(body?.username, 32).toLowerCase();
    const password = String(body?.password || "");
    const contactNumber = cleanText(body?.contact_number, 40);
    if (!fullName || !USERNAME_PATTERN.test(username)) return json({ error: "Username must start with a letter and contain 3–32 lowercase letters, numbers, dots, hyphens, or underscores." }, 400);
    if (password.length < 12) return json({ error: "The password must be at least 12 characters." }, 400);
    const { count, error: countError } = await adminClient.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin_viewer");
    if (countError) throw countError;
    if ((count || 0) >= 40) return json({ error: "The limit of 40 view-only Administrator accounts has been reached." }, 409);
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email: `${username}@admin.tfro-mis.local`, password, email_confirm: true, user_metadata: { full_name: fullName, contact_number: contactNumber, role: "operator" } });
    if (createError || !created.user) return json({ error: createError?.message || "Unable to create the account." }, 400);
    const { error: roleError } = await adminClient.from("profiles").update({ role: "admin_viewer", username, full_name: fullName, contact_number: contactNumber || null }).eq("id", created.user.id);
    if (roleError) { await adminClient.auth.admin.deleteUser(created.user.id, true); return json({ error: roleError.message }, 409); }
    await adminClient.from("audit_logs").insert({ user_id: caller.id, user_name: callerProfile.full_name || "Head Administrator", role: "admin", action: "Created view-only Administrator account", action_type: "create", record: fullName, description: `Created view-only Administrator username ${username}.` });
    return json({ success: true, user_id: created.user.id, username }, 201);
  } catch (error) {
    console.error("admin-create-viewer failed", error);
    return json({ error: error instanceof Error ? error.message : "Unable to manage the account." }, 500);
  }
});
