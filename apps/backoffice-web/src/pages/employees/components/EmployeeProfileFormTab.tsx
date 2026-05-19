import {
  FormField,
  Input,
  MoneyInput,
  DateTimeField,
  FormFieldProps,
} from "@erp/ui";
import type { EmployeeFormDraft } from "../employee.types";
import { MOCK_JOB_POSITIONS } from "../employees.mock";

interface EmployeeProfileFormTabProps {
  draft: EmployeeFormDraft;
  onChange: (draft: EmployeeFormDraft) => void;
}

export function EmployeeProfileFormTab({
  draft,
  onChange,
}: EmployeeProfileFormTabProps) {
  const fieldProps: Partial<FormFieldProps> = {
    layout: "horizontal",
    labelWidth: "9.5rem",
  };

  const setProfile = (patch: Partial<EmployeeFormDraft["profile"]>) => {
    onChange({ ...draft, profile: { ...draft.profile, ...patch } });
  };

  return (
    <div className="space-y-3 p-4">
      <FormField label="Vị trí công việc" {...fieldProps}>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={draft.profile.jobPositionId ?? ""}
          onChange={(e) =>
            setProfile({ jobPositionId: e.target.value || undefined })
          }
        >
          <option value="">— Chọn vị trí —</option>
          {MOCK_JOB_POSITIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Ngày thử việc" {...fieldProps}>
          <DateTimeField
            value={draft.profile.probationDate ?? ""}
            onChange={(e) =>
              setProfile({ probationDate: e.target.value || undefined })
            }
            includeTime={false}
          />
        </FormField>
        <FormField label="Ngày chính thức" {...fieldProps}>
          <DateTimeField
            value={draft.profile.officialDate ?? ""}
            onChange={(e) =>
              setProfile({ officialDate: e.target.value || undefined })
            }
            includeTime={false}
          />
        </FormField>
        <FormField label="Tiền lương" {...fieldProps}>
          <MoneyInput
            value={draft.profile.salary}
            onChange={(v) => setProfile({ salary: v === "" ? 0 : v })}
          />
        </FormField>
        <FormField label="Tiền đặt cọc" {...fieldProps}>
          <MoneyInput
            value={draft.profile.deposit}
            onChange={(v) => setProfile({ deposit: v === "" ? 0 : v })}
          />
        </FormField>
      </div>
      <FormField label="Danh sách hồ sơ gốc" {...fieldProps}>
        <Input
          value={draft.profile.originalDocumentsNote}
          onChange={(e) =>
            setProfile({ originalDocumentsNote: e.target.value })
          }
        />
      </FormField>
    </div>
  );
}
