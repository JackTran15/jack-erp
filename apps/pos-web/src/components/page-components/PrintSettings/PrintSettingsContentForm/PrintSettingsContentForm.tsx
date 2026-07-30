import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { RefreshIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PrintSettingsContentField } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsContentForm/PrintSettingsContentField/PrintSettingsContentField";
import { PrintSettingsLinesEditor } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsContentForm/PrintSettingsLinesEditor/PrintSettingsLinesEditor";
import { PrintSettingsPaymentsEditor } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsContentForm/PrintSettingsPaymentsEditor/PrintSettingsPaymentsEditor";
import {
  SAMPLE_DOC_TYPE_OPTIONS,
  SAMPLE_INVOICE_FIELD_GROUPS,
} from "@erp/pos/constants/print-sample-invoice.constant";
import type { UseSampleInvoiceResult } from "@erp/pos/hooks/page-hooks/print-settings/use-sample-invoice";
import type {
  SampleDerivedFieldKey,
  SampleFieldKey,
  SampleNumberFieldKey,
} from "@erp/pos/types/print-sample-invoice.type";

export interface PrintSettingsContentFormProps {
  sample: UseSampleInvoiceResult;
}

/** Mọi field của `InvoiceTotals` là số, các field còn lại là chuỗi. */
function isNumberKey(key: SampleFieldKey): key is SampleNumberFieldKey {
  return key.startsWith("totals.");
}

const SECTION_TITLE =
  "text-sm font-bold uppercase tracking-wide text-gray-900";

/**
 * Editor nội dung hóa đơn mẫu. Nhóm field lấy từ
 * `SAMPLE_INVOICE_FIELD_GROUPS` và render bằng `.map` — thêm một thành phần
 * hóa đơn chỉ cần khai báo thêm metadata, không phải sửa component này.
 *
 * Hai khối danh sách động (hàng hóa, thanh toán) chèn thủ công sau nhóm
 * "Thông tin" để thứ tự trên form khớp thứ tự trên tờ bill.
 */
export function PrintSettingsContentForm({
  sample,
}: PrintSettingsContentFormProps) {
  const {
    draft,
    derived,
    setText,
    setNumber,
    setEnabled,
    enableAllFields,
    isAllEnabled,
    setDocType,
    setOverride,
    clearOverride,
    addLine,
    updateLine,
    removeLine,
    addPayment,
    updatePayment,
    removePayment,
    resetDraft,
  } = sample;

  const selectedDocType =
    SAMPLE_DOC_TYPE_OPTIONS.find((o) => o.value === draft.docType) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-white p-3">
        <p className="text-[12px] leading-snug text-gray-600">
          Bỏ tick một dòng là thành phần đó biến mất khỏi bill. Giá trị vẫn được
          giữ lại nên tick lại là có ngay.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={enableAllFields}
            disabled={isAllEnabled}
            title="Tick hết mọi thành phần để xem một lượt hóa đơn có những gì"
            className="inline-flex h-9 items-center justify-center rounded-md bg-[#5B5BD6] px-3 text-sm font-medium text-white hover:bg-[#4A4ABF] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAllEnabled ? "Đang hiện tất cả" : "Hiện tất cả"}
          </button>
          <button
            type="button"
            onClick={resetDraft}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            <RefreshIcon size={14} />
            Khôi phục mẫu gốc
          </button>
        </div>
      </div>

      {SAMPLE_INVOICE_FIELD_GROUPS.map((group) => (
        <div key={group.title} className="contents">
          <section>
            <h2 className={SECTION_TITLE}>{group.title}</h2>
            {group.description ? (
              <p className="mt-1 text-[12px] leading-snug text-gray-500">
                {group.description}
              </p>
            ) : null}

            <div className="mt-2 divide-y divide-gray-100">
              {group.title === "Hóa đơn" ? (
                <div className="py-2 pl-6">
                  <PosSelect
                    label="Loại hóa đơn"
                    fieldLayout="vertical"
                    value={selectedDocType}
                    onChange={(item) => setDocType(item.value)}
                    items={SAMPLE_DOC_TYPE_OPTIONS}
                    itemKey={(item) => item.value}
                    renderItem={(item) => item.label}
                    variant="boxed"
                    ariaLabel="Loại hóa đơn"
                    placeholder="Chọn loại hóa đơn"
                  />
                </div>
              ) : null}

              {group.fields.map((meta) => {
                // Gán ra biến const trước để type guard thu hẹp được kiểu —
                // gọi thẳng trên `meta.key` (property access) thì TS không narrow.
                const key = meta.key;
                const derivedKey = key as SampleDerivedFieldKey;
                const isOverridden =
                  Boolean(meta.derived) &&
                  draft.overrides[derivedKey] !== undefined;

                return (
                  <PrintSettingsContentField
                    key={key}
                    meta={meta}
                    enabled={draft.enabled[key]}
                    onToggle={(next) => setEnabled(key, next)}
                    value={
                      isNumberKey(key) ? draft.numbers[key] : draft.texts[key]
                    }
                    onChange={(next) =>
                      isNumberKey(key)
                        ? setNumber(key, Number(next))
                        : setText(key, String(next))
                    }
                    derivedValue={
                      meta.derived ? derived[derivedKey] : undefined
                    }
                    isOverridden={isOverridden}
                    onOverride={
                      meta.derived
                        ? (next) =>
                            next === null
                              ? clearOverride(derivedKey)
                              : setOverride(derivedKey, next)
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </section>

          {group.title === "Thông tin khách & nhân viên" ? (
            <>
              <section>
                <h2 className={SECTION_TITLE}>Hàng hóa</h2>
                <p className="mt-1 text-[12px] leading-snug text-gray-500">
                  Số thứ tự trên bill tự đánh lại theo vị trí — thêm/xóa dòng
                  không làm lệch cột &quot;#&quot;.
                </p>
                <div className="mt-2">
                  <PrintSettingsLinesEditor
                    lines={draft.lines}
                    onAdd={addLine}
                    onUpdate={updateLine}
                    onRemove={removeLine}
                  />
                </div>
              </section>

              <section>
                <h2 className={SECTION_TITLE}>Thanh toán</h2>
                <p className="mt-1 text-[12px] leading-snug text-gray-500">
                  Tổng các dòng này chính là số &quot;Đã trả&quot; dùng để tính
                  tiền thối.
                </p>
                <div className="mt-2">
                  <PrintSettingsPaymentsEditor
                    payments={draft.payments}
                    onAdd={addPayment}
                    onUpdate={updatePayment}
                    onRemove={removePayment}
                  />
                </div>
              </section>
            </>
          ) : null}
        </div>
      ))}

      <p className="text-[11px] leading-snug text-gray-500">
        Nội dung này chỉ dùng để xem trước và in thử — không ảnh hưởng hóa đơn
        thật. Cấu hình lưu riêng trên máy này.
      </p>
    </div>
  );
}
