import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  createCustomer,
  type CustomerRow,
} from "../lib/customerApi";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: CustomerRow) => void;
  defaultPhone: string;
};

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
  defaultPhone,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastNameId = useId();
  const firstNameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const addressId = useId();

  const [formLastName, setFormLastName] = useState("");
  const [formFirstName, setFormFirstName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setFormLastName("");
      setFormFirstName("");
      setFormPhone(defaultPhone.trim());
      setFormEmail("");
      setFormAddress("");
      setError("");
      setLoading(false);
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, defaultPhone]);

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
    const lastName = formLastName.trim();
    const firstName = formFirstName.trim();
    const phone = formPhone.trim();
    if (!phone) { setError("Số điện thoại bắt buộc."); return; }
    if (!lastName) { setError("Họ bắt buộc."); return; }
    if (!firstName) { setError("Tên bắt buộc."); return; }
    setError("");
    setLoading(true);
    try {
      const created = await createCustomer({
        lastName,
        firstName,
        phone,
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
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
                Số điện thoại <span className="pos-required">*</span>
              </label>
              <input
                id={phoneId}
                className="pos-input"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
              />
              <p className="pos-hint pos-mt-0">
                Từ ô tìm — chỉnh sửa được.
              </p>
            </div>

            <div className="pos-create-customer-form__row">
              <div className="pos-create-customer-form__field">
                <label htmlFor={lastNameId}>
                  Họ <span className="pos-required">*</span>
                </label>
                <input
                  id={lastNameId}
                  className="pos-input"
                  type="text"
                  autoComplete="family-name"
                  value={formLastName}
                  onChange={(e) => setFormLastName(e.target.value)}
                />
              </div>
              <div className="pos-create-customer-form__field">
                <label htmlFor={firstNameId}>
                  Tên <span className="pos-required">*</span>
                </label>
                <input
                  id={firstNameId}
                  className="pos-input"
                  type="text"
                  autoComplete="given-name"
                  value={formFirstName}
                  onChange={(e) => setFormFirstName(e.target.value)}
                />
              </div>
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

            <div className="pos-create-customer-form__field">
              <label htmlFor={addressId}>Địa chỉ</label>
              <textarea
                id={addressId}
                className="pos-input"
                autoComplete="street-address"
                rows={2}
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                style={{ minHeight: "3rem", padding: "0.5rem" }}
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
                {loading ? "Đang lưu…" : "Lưu và chọn"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>
  );
}
