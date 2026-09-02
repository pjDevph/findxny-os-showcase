"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { UnitPicker, PURCHASE_UNIT_GROUPS } from "@/features/admin/products/UnitPicker";

export type IngredientCategory = "food" | "drink" | "consumable" | "operational";

export const INGREDIENT_CATEGORIES: { id: IngredientCategory; label: string; color: string }[] = [
  { id: "food",        label: "Food",        color: "#F59E0B" },
  { id: "drink",       label: "Drink",       color: "#3B82F6" },
  { id: "consumable",  label: "Consumable",  color: "#10B981" },
  { id: "operational", label: "Operational", color: "#8B5CF6" },
];

export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  category: IngredientCategory;
  cost_per_unit: number;
  low_stock_threshold: number;
  archived: boolean;
  expiry_date?: string | null;
  batch_number?: string | null;
};

export function IngredientEditor({
  ingredient,
  branches = [],
  saveAction,
  deleteAction,
}: {
  ingredient?: Ingredient;
  /** Only needed on create — lets the opening stock count land at a branch. */
  branches?: { id: string; name: string }[];
  saveAction: (formData: FormData) => Promise<void>;
  deleteAction?: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<IngredientCategory>(ingredient?.category ?? "food");
  const [name, setName] = useState(ingredient?.name ?? "");
  // Cost and unit are also required by the save action (see ingredientSaveAction),
  // so track them too — mirrors the name field's controlled pattern.
  const [cost, setCost] = useState<string>(
    ingredient?.cost_per_unit !== undefined ? String(ingredient.cost_per_unit) : "0",
  );
  const [unit, setUnit] = useState<string>(ingredient?.unit ?? "g");
  const formId = `ingredient-form-${ingredient?.id ?? "new"}`;
  const isEdit = !!ingredient;

  const costNum = Number(cost);
  const canSave = name.trim() !== "" && unit.trim() !== "" && cost.trim() !== "" && Number.isFinite(costNum);

  function handleOpen() {
    setCategory(ingredient?.category ?? "food");
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className={isEdit ? "btn-xs" : "btn btn-primary"}
        onClick={handleOpen}
      >
        {isEdit ? "Edit" : "+ Add inventory"}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? `Edit ${ingredient!.name}` : "Add inventory"}
        subtitle={isEdit ? "Cost changes recalculate every recipe that uses it. Use Adjust to change stock quantity." : undefined}
        footer={
          <>
            {isEdit && deleteAction && (
              <span style={{ marginRight: "auto" }}>
                <ConfirmActionButton
                  className="btn-xs"
                  style={{ color: "var(--err)" }}
                  title={`Archive ${ingredient!.name}?`}
                  body="It will be hidden from recipes and lists. Existing recipes that reference it keep their saved cost."
                  confirmLabel="Archive"
                  tone="danger"
                  action={async () => {
                    const fd = new FormData();
                    fd.set("id", ingredient!.id);
                    await deleteAction(fd);
                    setOpen(false);
                  }}
                >
                  Archive
                </ConfirmActionButton>
              </span>
            )}
            <span style={{ fontSize: 12, color: "var(--text-3)", marginRight: "auto" }}>* Required</span>
            <button type="button" className="btn-xs" onClick={() => setOpen(false)}>Cancel</button>
            <ConfirmSubmitButton
              formId={formId}
              disabled={!canSave}
              title={isEdit ? `Save changes to ${ingredient!.name}?` : "Add this inventory item?"}
              body={isEdit ? "Cost changes recalculate every recipe that uses it." : undefined}
              confirmLabel={isEdit ? "Save" : "Create"}
            >
              {isEdit ? "Save" : "Create"}
            </ConfirmSubmitButton>
          </>
        }
      >
        <form
          id={formId}
          action={async (fd) => { await saveAction(fd); setOpen(false); }}
          style={{ display: "grid", gap: 14 }}
        >
          {isEdit && <input type="hidden" name="id" value={ingredient!.id} />}
          <input type="hidden" name="category" value={category} />

          {/* Category */}
          <div className="admin-field">
            <label>Category</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {INGREDIENT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 20,
                    border: `1px solid ${category === c.id ? c.color : "var(--line, #2a2a2a)"}`,
                    background: category === c.id ? `${c.color}18` : "var(--surface, #161616)",
                    color: category === c.id ? c.color : "var(--text-3, #999)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-field">
            <label htmlFor="ing-name">Name *</label>
            <input id="ing-name" className="input" name="name" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Beef belly" />
          </div>

          <div className="admin-field">
            <label htmlFor="ing-unit">Unit</label>
            <UnitPicker id="ing-unit" name="unit" defaultValue={ingredient?.unit ?? "g"} groups={PURCHASE_UNIT_GROUPS} onChange={setUnit} />
          </div>

          <div className="admin-field">
            <label htmlFor="ing-cost">Cost per unit (₱)</label>
            <input id="ing-cost" className="input" name="cost_per_unit" type="number" step="0.0001" min="0" required value={cost} onChange={e => setCost(e.target.value)} />
          </div>

          {/* Opening stock only on new ingredient creation — lands at one branch */}
          {!isEdit && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="admin-field">
                <label htmlFor="ing-branch">Branch</label>
                <select id="ing-branch" className="input" name="branch_id" defaultValue={branches[0]?.id ?? ""}>
                  {branches.length === 0 && <option value="">No branches</option>}
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="admin-field">
                <label htmlFor="ing-stock">
                  Starting stock
                  <span style={{ color: "var(--text-3)", fontWeight: 400, marginLeft: 6 }}>— use Adjust to change later</span>
                </label>
                <input id="ing-stock" className="input" name="initial_stock" type="number" step="0.001" min="0" defaultValue={0} />
              </div>
            </div>
          )}

          <div className="admin-field">
            <label htmlFor="ing-low">Low stock threshold</label>
            <input id="ing-low" className="input" name="low_stock_threshold" type="number" step="0.001" min="0" defaultValue={ingredient?.low_stock_threshold ?? 0} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="admin-field">
              <label htmlFor="ing-expiry">Expiry date</label>
              <input id="ing-expiry" className="input" name="expiry_date" type="date" defaultValue={ingredient?.expiry_date ?? ""} />
            </div>
            <div className="admin-field">
              <label htmlFor="ing-batch">Batch number</label>
              <input id="ing-batch" className="input" name="batch_number" type="text" defaultValue={ingredient?.batch_number ?? ""} placeholder="e.g. LOT-2024-001" />
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
