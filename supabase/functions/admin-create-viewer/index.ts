import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
// Keep handled errors readable in older browser bundles that discard the
// response body when the Edge Function uses a non-2xx status.
const rejected = (error: string) => json({ error });
const errorText = (value: unknown, fallback: string) => {
  if (typeof value === "string" && value.trim() && value.trim() !== "{}") return value.trim();
  if (value && typeof value === "object") {
    const candidate = value as { message?: unknown; error?: unknown; code?: unknown; status?: unknown; name?: unknown };
    for (const detail of [candidate.message, candidate.error, candidate.code]) {
      if (typeof detail === "string" && detail.trim() && detail.trim() !== "{}") {
        const status = typeof candidate.status === "number" ? ` (HTTP ${candidate.status})` : "";
        return `${detail.trim()}${status}`;
      }
    }
    try {
      const serialized = JSON.stringify(value);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Use the safe fallback below for non-serializable values.
    }
  }
  return fallback;
};
const cleanText = (value: unknown, limit: number) => String(value ?? "").trim().slice(0, limit);
const USERNAME_PATTERN = /^[a-z][a-z0-9_.-]{2,31}$/;

function generatedPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const random = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `Tf!${random}9a`;
}

function suggestedUsername(role: string, fullName: string, id: string) {
  const base = fullName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 20) || id.slice(0, 8);
  const prefix = role === "admin" ? "head" : role === "staff" ? "staff" : "admin";
  return `${prefix}.${base}`.slice(0, 32);
}

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
    if (!token) return rejected("Authentication is required.");
    const session = await authenticateHeadAdmin(token);
    if ("error" in session) return rejected(session.error);
    const { adminClient, caller, callerProfile } = session;
    const body = await request.json();
    const action = cleanText(body?.action || "create", 20);

    if (action === "list_accounts") {
      const visibleRoles = ["admin", "admin_viewer", "staff", "operator", "traffic_enforcer"];
      const { data: profiles, error } = await adminClient.from("profiles")
        .select("id, role, full_name, username, contact_number").in("role", visibleRoles).order("role").order("full_name");
      if (error) throw error;
      const accounts = await Promise.all((profiles || []).map(async (profile) => {
        const { data } = await adminClient.auth.admin.getUserById(profile.id);
        const email = data.user?.email || "";
        return {
          ...profile,
          login: profile.username || email || "—",
          email: email.endsWith("@admin.tfro-mis.local") ? "" : email,
          can_delete: ["admin_viewer", "staff", "operator", "traffic_enforcer"].includes(profile.role) && profile.id !== caller.id,
        };
      }));
      return json({ accounts });
    }

    if (action === "reset_password") {
      const userId = cleanText(body?.user_id, 64);
      const requestedUsername = cleanText(body?.username, 32).toLowerCase();
      if (!userId) return rejected("Choose a valid account.");
      const { data: target, error: targetError } = await adminClient.from("profiles")
        .select("id, role, full_name, username").eq("id", userId).maybeSingle();
      if (targetError) throw targetError;
      const allowedRoles = ["admin", "admin_viewer", "staff", "operator", "traffic_enforcer"];
      if (!target || !allowedRoles.includes(target.role)) return rejected("The selected account is unavailable.");

      let username = target.username || "";
      const authUpdate: { password: string; email?: string; email_confirm?: boolean } = { password: generatedPassword() };
      if (["admin", "admin_viewer"].includes(target.role)) {
        username = requestedUsername || username || suggestedUsername(target.role, target.full_name || "", target.id);
        if (!USERNAME_PATTERN.test(username)) return rejected("Administrator username must contain 3–32 lowercase letters, numbers, dots, hyphens, or underscores and start with a letter.");
        const { data: duplicate, error: duplicateError } = await adminClient.from("profiles")
          .select("id").ilike("username", username).neq("id", target.id).maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicate) return rejected("That Administrator username is already in use.");
        authUpdate.email = `${username}@admin.tfro-mis.local`;
        authUpdate.email_confirm = true;
      }

      const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(target.id, authUpdate);
      if (updateError || !updated.user) throw updateError || new Error("The password could not be reset.");
      if (["admin", "admin_viewer"].includes(target.role)) {
        const { error: profileUpdateError } = await adminClient.from("profiles").update({ username }).eq("id", target.id);
        if (profileUpdateError) throw profileUpdateError;
      }
      await adminClient.from("audit_logs").insert({
        user_id: caller.id,
        user_name: callerProfile.full_name || "Head Administrator",
        role: "admin",
        action: "Reset portal account password",
        action_type: "update",
        record: target.full_name || target.id,
        description: `Reset the ${target.role} account password. The temporary password was displayed once and was not stored.`,
      });
      return json({ success: true, username: username || updated.user.email || "", temporary_password: authUpdate.password });
    }

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
      if (body?.confirmed !== true) return rejected("Account deletion requires confirmation from the Head Administrator.");
      if (!userId || userId === caller.id) return rejected("Choose a valid restricted Administrator account.");
      const { data: target, error: targetError } = await adminClient.from("profiles").select("id, role, full_name, username").eq("id", userId).maybeSingle();
      if (targetError) throw targetError;
      if (!target || target.role !== "admin_viewer") return rejected("Only restricted Administrator accounts can be deleted here.");
      const { error: disableError } = await adminClient.from("profiles").update({ role: "disabled_admin_viewer", username: null }).eq("id", target.id);
      if (disableError) throw disableError;
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(target.id, true);
      if (deleteError) throw deleteError;
      await adminClient.from("audit_logs").insert({ user_id: caller.id, user_name: callerProfile.full_name || "Head Administrator", role: "admin", action: "Deleted restricted Administrator account", action_type: "delete", record: target.full_name || target.username || target.id, description: "Removed restricted Administrator portal access." });
      return json({ success: true });
    }

    if (action === "delete_staff") {
      const userId = cleanText(body?.user_id, 64);
      if (body?.confirmed !== true) return rejected("Account deletion requires confirmation from the Head Administrator.");
      if (!userId || userId === caller.id) return rejected("Choose a valid TFRO Staff account.");
      const { data: target, error: targetError } = await adminClient.from("profiles")
        .select("id, role, full_name, username").eq("id", userId).maybeSingle();
      if (targetError) throw targetError;
      if (!target || target.role !== "staff") return rejected("Only TFRO Staff accounts can be deleted here.");
      const { error: profileDeleteError } = await adminClient.from("profiles").delete().eq("id", target.id);
      if (profileDeleteError) throw profileDeleteError;
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(target.id, true);
      if (deleteError) throw deleteError;
      await adminClient.from("audit_logs").insert({
        user_id: caller.id, user_name: callerProfile.full_name || "Head Administrator", role: "admin",
        action: "Deleted TFRO Staff account", action_type: "delete",
        record: target.full_name || target.username || target.id,
        description: "Removed TFRO Staff portal access while retaining operational records.",
      });
      return json({ success: true });
    }

    if (action === "create_staff") {
      const fullName = cleanText(body?.full_name, 120);
      const username = cleanText(body?.username, 32).toLowerCase();
      const password = String(body?.password || "");
      const contactNumber = cleanText(body?.contact_number, 40);
      if (!fullName || !USERNAME_PATTERN.test(username)) return rejected("Username must start with a letter and contain 3–32 lowercase letters, numbers, dots, hyphens, or underscores.");
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}/.test(password)) return rejected("Password must have at least 12 characters, including uppercase, lowercase, a number, and a symbol.");
      const { data: duplicate, error: duplicateError } = await adminClient.from("profiles").select("id").ilike("username", username).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) return rejected("That username is already in use.");

      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const projectUrl = Deno.env.get("SUPABASE_URL") || "";
      const internalEmail = `${username}@staff.tfro-mis.local`;
      const { error: markerError } = await adminClient.from("internal_admin_provisioning").upsert({
        email: internalEmail, requested_by: caller.id,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      if (markerError) return rejected(`Unable to authorize internal account provisioning: ${markerError.message}`);
      const authResponse = await fetch(`${projectUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          email: internalEmail, password, email_confirm: true,
          user_metadata: { full_name: fullName, contact_number: contactNumber, role: "operator" },
          app_metadata: { account_type: "staff", provisioned_by: "head_admin" },
        }),
      });
      const authText = await authResponse.text();
      let created: { id?: string; user?: { id?: string } } | null = null;
      try { created = authText ? JSON.parse(authText) : null; } catch { /* Use the response text below. */ }
      const createdUserId = created?.user?.id || created?.id;
      if (!authResponse.ok || !createdUserId) {
        await adminClient.from("internal_admin_provisioning").delete().eq("email", internalEmail);
        return rejected(errorText(created, authText || `Supabase Auth failed with HTTP ${authResponse.status}.`));
      }
      const { error: roleError } = await adminClient.from("profiles").update({ role: "staff", username, full_name: fullName, contact_number: contactNumber || null }).eq("id", createdUserId);
      if (roleError) { await adminClient.auth.admin.deleteUser(createdUserId, true); return rejected(roleError.message); }
      await adminClient.from("audit_logs").insert({
        user_id: caller.id, user_name: callerProfile.full_name || "Head Administrator", role: "admin",
        action: "Created TFRO Staff account", action_type: "create", record: fullName,
        description: `Created TFRO Staff username ${username}.`,
      });
      return json({ success: true, user_id: createdUserId, username }, 201);
    }

    if (action !== "create") return rejected("Unknown administrator action.");
    const fullName = cleanText(body?.full_name, 120);
    const username = cleanText(body?.username, 32).toLowerCase();
    const password = String(body?.password || "");
    const contactNumber = cleanText(body?.contact_number, 40);
    if (!fullName || !USERNAME_PATTERN.test(username)) return rejected("Username must start with a letter and contain 3–32 lowercase letters, numbers, dots, hyphens, or underscores.");
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}/.test(password)) {
      return rejected("Password must have at least 12 characters, including uppercase, lowercase, a number, and a symbol.");
    }
    const { count, error: countError } = await adminClient.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin_viewer");
    if (countError) throw countError;
    if ((count || 0) >= 40) return rejected("The limit of 40 restricted Administrator accounts has been reached.");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const projectUrl = Deno.env.get("SUPABASE_URL") || "";
    const internalEmail = `${username}@admin.tfro-mis.local`;
    const { error: markerError } = await adminClient.from("internal_admin_provisioning").upsert({
      email: internalEmail,
      requested_by: caller.id,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    if (markerError) return rejected(`Unable to authorize internal account provisioning: ${markerError.message}`);
    const authResponse = await fetch(`${projectUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: internalEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, contact_number: contactNumber, role: "operator" },
        app_metadata: { account_type: "admin_viewer", provisioned_by: "head_admin" },
      }),
    });
    const authText = await authResponse.text();
    let created: { id?: string; user?: { id?: string } } | null = null;
    try { created = authText ? JSON.parse(authText) : null; } catch { /* Use the response text below. */ }
    const createdUserId = created?.user?.id || created?.id;
    if (!authResponse.ok || !createdUserId) {
      await adminClient.from("internal_admin_provisioning").delete().eq("email", internalEmail);
      const detail = errorText(created, authText || `Supabase Auth failed with HTTP ${authResponse.status}.`);
      console.error("Unable to create restricted Administrator Auth user", authResponse.status, detail);
      return rejected(detail);
    }
    const { error: roleError } = await adminClient.from("profiles").update({ role: "admin_viewer", username, full_name: fullName, contact_number: contactNumber || null }).eq("id", createdUserId);
    if (roleError) { await adminClient.auth.admin.deleteUser(createdUserId, true); return rejected(roleError.message); }
    await adminClient.from("audit_logs").insert({ user_id: caller.id, user_name: callerProfile.full_name || "Head Administrator", role: "admin", action: "Created restricted Administrator account", action_type: "create", record: fullName, description: `Created restricted Administrator username ${username}.` });
    return json({ success: true, user_id: createdUserId, username }, 201);
  } catch (error) {
    console.error("admin-create-viewer failed", error);
    return rejected(errorText(error, "Unable to manage the account."));
  }
});
