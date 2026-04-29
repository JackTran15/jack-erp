import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  createCustomer,
  phoneDigitsOnly,
  type CustomerRow,
} from "../lib/customerApi";

export type CustomerCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: CustomerRow) => void;
  defaultQuery: string;
};
type Props = CustomerCreateDialogProps;

function userFacingError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (m.startsWith("HTTP 403")) return "Không có quyền tạo khách (customer.write).";
    if (m.startsWith("HTTP 401")) return "Phiên hết hạn. Đăng nhập lại.";
    return m.replace(/^HTTP \d+: /, "").slice(0, 400) || "Đã xảy ra lỗi.";
  }
  return "Lỗi không xác định.";
}

export function CustomerCreateDialog({
  open,
  onClose,
  onCreated,
  defaultQuery,
}: CustomerCreateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();

  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      const seed = defaultQuery.trim();
      const digits = phoneDigitsOnly(seed);
      const isPhoneLike = digits.length >= 6 && digits.length >= seed.length - 1;
      setFormName(isPhoneLike ? "" : seed);
      setFormPhone(isPhoneLike ? seed : "");
      setFormEmail("");
      setError("");
      setLoading(false);
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, defaultQuery]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const phone = formPhone.trim() || undefined;
    if (!name) { setError("Tên khách hàng bắt buộc."); return; }
    setError("");
    setLoading(true);
    try {
      const created = await createCustomer({
        name,
        phone,
        email: formEmail.trim() || undefined,
      });
      onCreated(created);
    } catch (err) {
      setError(userFacingError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="pos-dialog"
      aria-labelledby="create-customer-title"
    >
      <div className="pos-dialog__inner">
        <div className="pos-dialog__header">
          <h2 id="create-customer-title" className="pos-dialog__title">
            Tạo khách hàng mới
          </h2>
          <button
            type="button"
            className="pos-btn pos-btn--secondary pos-btn--sm pos-dialog__close"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <div className="pos-dialog__body">
          {error ? (
            <div className="pos-dialog__alert" role="alert">{error}</div>
          ) : null}

          <form
            onSubmit={handleCreate}
            noValidate
            className="pos-create-customer-form"
          >
            <div className="pos-create-customer-form__field">
              <label htmlFor={phoneId}>
                Số điện thoại (tuỳ chọn)
              </label>
              <input
                id={phoneId}
                className="pos-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
              />
            </div>

            <div className="pos-create-customer-form__field">
              <label htmlFor={nameId}>
                Tên khách hàng <span className="pos-required">*</span>
              </label>
              <input
                id={nameId}
                className="pos-input"
                type="text"
                autoComplete="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="pos-create-customer-form__field">
              <label htmlFor={emailId}>Email</label>
              <input
                id={emailId}
                className="pos-input"
                type="email"
                autoComplete="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>

            <div className="pos-create-customer-form__actions">
              <button
                type="button"
                className="pos-btn pos-btn--secondary"
                onClick={onClose}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="pos-btn pos-btn--primary"
                disabled={loading}
              >
                {loading ? "Đang lưu…" : "Lưu và chọn khách này"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>
  );
}
