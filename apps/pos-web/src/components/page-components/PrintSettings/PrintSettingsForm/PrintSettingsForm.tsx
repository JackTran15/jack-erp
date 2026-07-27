import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { PrintSettingsField } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsForm/PrintSettingsField/PrintSettingsField";
import {
  PAPER_WIDTH_PRESETS,
  RECEIPT_ALIGN_OPTIONS,
  RECEIPT_LAYOUT_FIELD_GROUPS,
} from "@erp/pos/constants/print-settings.constant";
import type { ReceiptLayoutSettings } from "@erp/pos/interfaces/print-settings.interface";

export interface PrintSettingsFormProps {
  settings: ReceiptLayoutSettings;
  onChange: <K extends keyof ReceiptLayoutSettings>(
    key: K,
    value: ReceiptLayoutSettings[K],
  ) => void;
}

/**
 * Form thông số, nhóm theo `RECEIPT_LAYOUT_FIELD_GROUPS`. Hai field không phải
 * số (khổ giấy, căn ngang) render riêng bằng `PosSelect` và được đặt lên đầu
 * nhóm "Khổ giấy & lề" vì đó là hai thứ nên thử trước khi đụng tới con số.
 */
export function PrintSettingsForm({
  settings,
  onChange,
}: PrintSettingsFormProps) {
  const selectedPaper =
    PAPER_WIDTH_PRESETS.find((p) => p.value === settings.pageWidth) ?? null;
  const selectedAlign =
    RECEIPT_ALIGN_OPTIONS.find((a) => a.value === settings.align) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {RECEIPT_LAYOUT_FIELD_GROUPS.map((group, groupIndex) => (
        <section key={group.title}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
            {group.title}
          </h2>
          {group.description ? (
            <p className="mt-1 text-[12px] leading-snug text-gray-500">
              {group.description}
            </p>
          ) : null}

          <div className="mt-2 divide-y divide-gray-100">
            {groupIndex === 0 ? (
              <div className="flex flex-col gap-3 py-2">
                <PosSelect
                  label="Khổ giấy"
                  fieldLayout="vertical"
                  value={selectedPaper}
                  onChange={(item) => onChange("pageWidth", item.value)}
                  items={PAPER_WIDTH_PRESETS}
                  itemKey={(item) => item.value}
                  renderItem={(item) => item.label}
                  variant="boxed"
                  ariaLabel="Khổ giấy"
                  placeholder="Chọn khổ giấy"
                />
                <PosSelect
                  label="Căn ngang"
                  fieldLayout="vertical"
                  value={selectedAlign}
                  onChange={(item) => onChange("align", item.value)}
                  items={RECEIPT_ALIGN_OPTIONS}
                  itemKey={(item) => item.value}
                  renderItem={(item) => item.label}
                  variant="boxed"
                  ariaLabel="Căn ngang"
                  placeholder="Chọn kiểu căn"
                />
              </div>
            ) : null}

            {group.fields.map((meta) => (
              <PrintSettingsField
                key={meta.key}
                meta={meta}
                value={settings[meta.key]}
                onChange={(next) => onChange(meta.key, next)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
