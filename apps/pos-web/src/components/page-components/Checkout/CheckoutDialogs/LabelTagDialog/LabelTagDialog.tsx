import { useEffect, useMemo, useState } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { usePosCheckoutLabelsStore } from "@erp/pos/stores/page-stores/checkout/checkout-labels.store";
import { LabelSearchBar } from "./LabelSearchBar/LabelSearchBar";
import { LabelAddForm } from "./LabelAddForm/LabelAddForm";
import { LabelListRow } from "./LabelListRow/LabelListRow";

export interface LabelTagDialogProps {
  open: boolean;
  onClose: () => void;
}

export function LabelTagDialog({ open, onClose }: LabelTagDialogProps) {
  const labels = usePosCheckoutLabelsStore((s) => s.labels);
  const storeSelectedIds = usePosCheckoutLabelsStore(
    (s) => s.selectedLabelIds,
  );
  const setSelectedLabelIds = usePosCheckoutLabelsStore(
    (s) => s.setSelectedLabelIds,
  );
  const addLabel = usePosCheckoutLabelsStore((s) => s.addLabel);
  const updateLabel = usePosCheckoutLabelsStore((s) => s.updateLabel);
  const deleteLabel = usePosCheckoutLabelsStore((s) => s.deleteLabel);

  const [query, setQuery] = useState("");
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setAddFormOpen(false);
      setNewLabelName("");
      setEditingId(null);
      setEditingName("");
      setDraftSelectedIds(storeSelectedIds);
    }
  }, [open, storeSelectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return labels;
    return labels.filter((l) => l.name.toLowerCase().includes(q));
  }, [labels, query]);

  const toggleDraft = (id: string) => {
    setDraftSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleCreateLabel = () => {
    const trimmed = newLabelName.trim();
    if (!trimmed) return;
    addLabel(trimmed);
    setNewLabelName("");
  };

  const handleEditStart = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleEditSave = () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) return;
    updateLabel(editingId, { name: trimmed });
    setEditingId(null);
    setEditingName("");
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleDelete = (id: string) => {
    deleteLabel(id);
    if (editingId === id) handleEditCancel();
    setDraftSelectedIds((prev) => prev.filter((p) => p !== id));
  };

  const handleConfirm = () => {
    setSelectedLabelIds(draftSelectedIds);
    onClose();
  };

  return (
    <PosDialog open={open} onClose={onClose} width={420}>
      <PosDialog.Header title="Gắn nhãn" />
      <PosDialog.Body className="space-y-4">
        <LabelSearchBar
          query={query}
          onQueryChange={setQuery}
          addFormOpen={addFormOpen}
          onToggleAddForm={() => setAddFormOpen((v) => !v)}
        />
        {addFormOpen ? (
          <LabelAddForm
            value={newLabelName}
            onChange={setNewLabelName}
            onSubmit={handleCreateLabel}
          />
        ) : null}
        <div>
          <h3 className="mb-3 text-[14px] font-bold text-[#1F2937]">
            Danh sách nhãn
          </h3>
          <ul className="space-y-1">
            {filtered.length === 0 ? (
              <li className="py-6 text-center text-sm italic text-gray-400">
                Không có nhãn nào
              </li>
            ) : (
              filtered.map((label) => (
                <LabelListRow
                  key={label.id}
                  label={label}
                  checked={draftSelectedIds.includes(label.id)}
                  onToggle={() => toggleDraft(label.id)}
                  editing={editingId === label.id}
                  editingName={editingName}
                  onEditStart={() => handleEditStart(label.id, label.name)}
                  onEditChange={setEditingName}
                  onEditSave={handleEditSave}
                  onEditCancel={handleEditCancel}
                  onDelete={() => handleDelete(label.id)}
                />
              ))
            )}
          </ul>
        </div>
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={handleConfirm}
        saveLabel="Xác nhận"
        onCancel={onClose}
        cancelLabel="Đóng"
      />
    </PosDialog>
  );
}
