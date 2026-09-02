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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication is required." }, 401);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !publishableKey || !serviceRoleKey) return json({ error: "Server configuration is incomplete." }, 500);

    const callerClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

    const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !callerData.user) return json({ error: "Your administrator session is invalid or expired." }, 401);

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles").select("role").eq("id", callerData.user.id).maybeSingle();
    if (callerProfileError) throw callerProfileError;
    if (callerProfile?.role !== "admin") return json({ error: "Only Administrators can delete accounts." }, 403);

    const body = await request.json();
    const userId = String(body?.user_id || "").trim();
    const expectedRole = String(body?.role || "").trim();
    if (!userId || !["operator", "traffic_enforcer"].includes(expectedRole)) {
      return json({ error: "A valid Operator or Traffic Enforcer account is required." }, 400);
    }
    if (userId === callerData.user.id) return json({ error: "You cannot delete your own Administrator account." }, 400);

    const { data: target, error: targetError } = await adminClient
      .from("profiles").select("id, role, full_name").eq("id", userId).maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.role !== expectedRole || !["operator", "traffic_enforcer"].includes(target.role)) {
      return json({ error: "The selected account no longer exists or its role changed." }, 409);
    }

    // Remove operational authorization first. This immediately blocks role
    // policies tied to the linked roster while regulatory history remains.
    if (target.role === "operator") {
      const { error } = await adminClient.from("operators").update({ user_id: null }).eq("user_id", userId);
      if (error) throw error;
      await adminClient.from("franchises").update({ operator_id: null }).eq("operator_id", userId);
    } else {
      const { error } = await adminClient.from("traffic_enforcers")
        .update({ user_id: null, status: "inactive", updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
    }

    // Soft deletion prevents sign-in and refresh-token use while preserving the
    // Auth row required by historical foreign keys. It is intentionally final.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId, true);
    if (deleteError) throw deleteError;

    await adminClient.from("audit_logs").insert({
      user_id: callerData.user.id,
      user_name: "Administrator",
      role: "admin",
      action: `Deleted ${target.role === "operator" ? "Operator" : "Traffic Enforcer"} account`,
      action_type: "delete",
      record: target.full_name || userId,
      description: `Removed portal access for ${target.full_name || userId} while retaining operational records.`,
    });

    return json({ success: true, deleted_user_id: userId, retained_history: true });
  } catch (error) {
    console.error("admin-delete-account failed", error);
    return json({ error: error instanceof Error ? error.message : "Account deletion failed." }, 500);
  }
});
