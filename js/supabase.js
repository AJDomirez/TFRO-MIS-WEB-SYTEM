import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

if (
  SUPABASE_URL === "PASTE_YOUR_PROJECT_URL_HERE" ||
  SUPABASE_PUBLISHABLE_KEY === "PASTE_YOUR_PUBLISHABLE_KEY_HERE"
) {
  throw new Error("Add your Supabase Project URL and Publishable key to js/supabase-config.js.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
