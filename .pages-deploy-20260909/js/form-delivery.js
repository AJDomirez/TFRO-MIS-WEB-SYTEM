import { supabase } from "./supabase.js";
import { logAudit } from "./audit-helper.js";

export async function sendOperatorForm({ formCode, recordType, recordId, recordLabel = recordId }) {
  const { error } = await supabase.rpc("send_operator_form", {
    p_form_code: formCode,
    p_record_type: recordType,
    p_record_id: Number(recordId),
  });
  if (error) {
    alert(`Could not send ${formCode}: ${error.message}`);
    return false;
  }
  await logAudit({
    action: `Sent ${formCode} to Operator`,
    actionType: "update",
    record: String(recordLabel),
    description: `Sent ${formCode} to the linked operator account.`,
  });
  alert(`${formCode} has been sent to the operator account.`);
  return true;
}
