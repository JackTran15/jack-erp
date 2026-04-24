import type { CrudEntityConfig } from "@erp/shared-interfaces";

interface CrudDetailViewProps {
  config: CrudEntityConfig;
  record: Record<string, unknown>;
  onClose: () => void;
}

export function CrudDetailView({
  config,
  record,
  onClose,
}: CrudDetailViewProps) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>{config.displayName} Detail</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <dl style={styles.list}>
          {config.fields.map((f) => (
            <div key={f.key} style={styles.row}>
              <dt style={styles.dt}>{f.label}</dt>
              <dd style={styles.dd}>{formatValue(record[f.key], f.type)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function formatValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return "—";
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "date") {
    try {
      return new Date(String(value)).toLocaleString();
    } catch {
      return String(value);
    }
  }
  return String(value);
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    paddingTop: 80,
    zIndex: 1000,
  },
  dialog: {
    background: "#fff",
    borderRadius: 12,
    padding: "24px 28px",
    width: "100%",
    maxWidth: 600,
    maxHeight: "80vh",
    overflowY: "auto",
    boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 600 },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 24,
    cursor: "pointer",
    color: "#667085",
    lineHeight: 1,
  },
  list: { margin: 0 },
  row: {
    display: "flex",
    padding: "10px 0",
    borderBottom: "1px solid #f2f4f7",
  },
  dt: {
    width: 180,
    flexShrink: 0,
    fontWeight: 500,
    fontSize: 13,
    color: "#667085",
  },
  dd: { margin: 0, fontSize: 14, color: "#101828" },
};
