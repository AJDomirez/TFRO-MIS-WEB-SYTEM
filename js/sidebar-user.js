/* =========================================================
   TFRO Shared Sidebar User Helper
   Populates the sidebar user name / role / avatar from the
   logged-in profile. Include after supabase.js on any page
   that shows a sidebar user widget.
   ========================================================= */
import { supabase } from "./supabase.js";

function initials(name = "") {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0].toUpperCase())
      .slice(0, 2)
      .join("") || "U"
  );
}

function roleLabel(role) {
  const map = {
    admin: "Administrator",
    staff: "Staff",
    operator: "Operator",
    driver: "Driver",
  };
  return map[role] || role || "User";
}

async function loadSidebarUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = profile?.full_name || user.user_metadata?.full_name || "";
  const role = profile?.role || localStorage.getItem("role") || "";

  const nameEl = document.getElementById("userName");
  const roleEl = document.getElementById("userRole");
  const avatarEl = document.getElementById("userAvatar");

  if (nameEl) nameEl.textContent = fullName || roleLabel(role);
  if (roleEl) roleEl.textContent = roleLabel(role);
  if (avatarEl) avatarEl.textContent = initials(fullName || roleLabel(role));
}

document.addEventListener("DOMContentLoaded", loadSidebarUser);
loadSidebarUser();
