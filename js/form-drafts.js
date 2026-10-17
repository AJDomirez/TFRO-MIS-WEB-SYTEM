import { supabase } from "./supabase.js";

export async function loadGeneratedFormValues({ formCode, recordType, recordId, preferDraft = true }) {
  const table = preferDraft
    ? "franchise_generated_document_drafts"
    : "franchise_generated_documents";
  const { data, error } = await supabase
    .from(table)
    .select("form_data")
    .eq("form_code", formCode)
    .eq("source_type", recordType)
    .eq("source_id", Number(recordId))
    .maybeSingle();
  if (error) throw error;
  if (data?.form_data && Object.keys(data.form_data).length) return data.form_data;
  if (!preferDraft) return {};
  return loadGeneratedFormValues({ formCode, recordType, recordId, preferDraft:false });
}

export async function saveGeneratedFormDraft({ formCode, recordType, recordId, formData }) {
  const { error } = await supabase.rpc("save_generated_form_draft", {
    p_form_code: formCode,
    p_record_type: recordType,
    p_record_id: Number(recordId),
    p_form_data: formData || {},
  });
  if (error) throw error;
  return true;
}

export async function generatedFormDraftBindings({ formCode, recordType, recordId }) {
  return {
    savedValues: await loadGeneratedFormValues({ formCode, recordType, recordId }),
    onSave: (formData) => saveGeneratedFormDraft({ formCode, recordType, recordId, formData }),
  };
}
