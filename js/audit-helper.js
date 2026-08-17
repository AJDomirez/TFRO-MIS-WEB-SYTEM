import { supabase } from "./supabase.js";

/**
 * Shared audit-log helper for TFRO-MIS.
 * Writes a standardized audit record for real user/system actions.
 *
 * @param {object} opts
 * @param {string} opts.action      Clean, human-readable action name (e.g. "Approved Franchise Application")
 * @param {string} opts.actionType  Category used for icons/filtering:
 *                                  login|logout|create|update|delete|approve|reject|upload|verification|assignment
 * @param {string} [opts.record]    Affected record id/number (e.g. FR-2026-001)
 * @param {string} [opts.description] Human-readable description
 * @param {string} [opts.previousValue]
 * @param {string} [opts.newValue]
 */
export async function logAudit({ action, actionType, record = null, description = null, previousValue = null, newValue = null }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let fullName = user.email || "";
    let role = null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile) {
      fullName = profile.full_name || user.email || "";
      role = profile.role || null;
    }
    if (!role) role = localStorage.getItem("role") || null;

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      user_name: fullName,
      role,
      action,
      action_type: actionType,
      record,
      description,
      previous_value: previousValue,
      new_value: newValue,
      ip_address: null,
    });
  } catch (err) {
    console.error("Audit log insert failed:", err);
  }
}
</content>
