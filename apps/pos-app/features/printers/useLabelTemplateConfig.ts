import { useState } from "react";
import { invokeFn } from "../../services/supabase";
import { useToast } from "../ui/ToastProvider";
import type { LabelTemplate } from "./types";

export function useLabelTemplateConfig(activeWorkspaceId: string | null | undefined, template: LabelTemplate) {
  const { showToast } = useToast();
  const [savingTemplate, setSavingTemplate] = useState(false);

  async function saveTemplate() {
    if (!activeWorkspaceId) return;
    setSavingTemplate(true);
    try {
      const { error } = await invokeFn("printers-config-update", {
        workspace_id: activeWorkspaceId, config_type: "labelTemplate", value: template,
      });
      if (error) throw error;
      showToast({ title: "Saved", message: "Label template saved.", type: "success" });
    } catch (e: any) {
      showToast({ title: "Error", message: e?.message ?? "Failed to save template", type: "error" });
    } finally {
      setSavingTemplate(false);
    }
  }

  return { savingTemplate, saveTemplate };
}
