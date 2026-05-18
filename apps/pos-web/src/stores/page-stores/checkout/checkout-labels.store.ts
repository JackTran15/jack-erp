import { create } from "zustand";

export interface LabelTag {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_LABEL_COLOR = "#F8D14E";

const initialLabels = (): LabelTag[] => [
  { id: "l-gap", name: "Gấp", color: DEFAULT_LABEL_COLOR },
];

interface PosCheckoutLabelsState {
  labels: LabelTag[];
  selectedLabelIds: string[];
  addLabel: (name: string) => LabelTag;
  updateLabel: (
    id: string,
    patch: Partial<Pick<LabelTag, "name" | "color">>,
  ) => void;
  deleteLabel: (id: string) => void;
  setSelectedLabelIds: (ids: string[]) => void;
  resetLabelsDraft: () => void;
}

function generateLabelId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePosCheckoutLabelsStore = create<PosCheckoutLabelsState>()(
  (set, get) => ({
    labels: initialLabels(),
    selectedLabelIds: [],

    addLabel: (name) => {
      const trimmed = name.trim();
      const next: LabelTag = {
        id: generateLabelId(),
        name: trimmed,
        color: DEFAULT_LABEL_COLOR,
      };
      set((state) => ({ labels: [...state.labels, next] }));
      return next;
    },

    updateLabel: (id, patch) =>
      set((state) => ({
        labels: state.labels.map((l) =>
          l.id === id ? { ...l, ...patch } : l,
        ),
      })),

    deleteLabel: (id) =>
      set((state) => ({
        labels: state.labels.filter((l) => l.id !== id),
        selectedLabelIds: state.selectedLabelIds.filter((sid) => sid !== id),
      })),

    setSelectedLabelIds: (ids) => {
      const known = new Set(get().labels.map((l) => l.id));
      set({ selectedLabelIds: ids.filter((id) => known.has(id)) });
    },

    resetLabelsDraft: () => set({ selectedLabelIds: [] }),
  }),
);
