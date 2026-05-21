import {
  FormField,
  LargeTextInput,
  MoneyInput,
  DateTimeField,
  FormFieldProps,
} from "@erp/ui";
import type { EmployeeFormDraft } from "../employee.types";
import { useCrudRecords } from "../../../components/crud/useCrudApi";

interface EmployeeProfileFormTabProps {
  draft: EmployeeFormDraft;
  onChange: (draft: EmployeeFormDraft) => void;
}

const FORM_LABEL_WIDTH = "9.5rem";

function setProfile(
  draft: EmployeeFormDraft,
  patch: Partial<EmployeeFormDraft["profile"]>,
): EmployeeFormDraft {
  return { ...draft, profile: { ...draft.profile, ...patch } };
}

export function EmployeeProfileFormTab({
  draft,
  onChange,
}: EmployeeProfileFormTabProps) {
  const fieldProps: Partial<FormFieldProps> = {
    layout: "horizontal",
    labelWidth: FORM_LABEL_WIDTH,
  };

  const { data: jobPositionsFetch, isLoading: jobPositionsLoading } =
    useCrudRecords(
      "job-positions",
      {
        page: 1,
        pageSize: 100,
        sortBy: "name",
        sortOrder: "asc",
        search: "",
        filters: { isActive: "true" },
      },
      true,
    );
  const jobPositions = (jobPositionsFetch?.data ?? []) as {
    id: string;
    name: string;
  }[];

  return (
    <div className="space-y-3 p-4">
      <FormField label="Vị trí công việc" {...fieldProps}>
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          value={draft.profile.jobPositionId ?? ""}
          disabled={jobPositionsLoading}
          onChange={(e) =>
            onChange(
              setProfile(draft, {
                jobPositionId: e.target.value || undefined,
              }),
            )
          }
        >
          <option value="">
            {jobPositionsLoading ? "Đang tải..." : "— Chọn vị trí —"}
          </option>
          {jobPositions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <FormField label="Ngày thử việc" {...fieldProps}>
          <DateTimeField
            value={draft.profile.probationDate ?? ""}
            onChange={(e) =>
              onChange(
                setProfile(draft, {
                  probationDate: e.target.value || undefined,
                }),
              )
            }
            includeTime={false}
          />
        </FormField>
        <FormField label="Ngày chính thức" {...fieldProps}>
          <DateTimeField
            value={draft.profile.officialDate ?? ""}
            onChange={(e) =>
              onChange(
                setProfile(draft, {
                  officialDate: e.target.value || undefined,
                }),
              )
            }
            includeTime={false}
          />
        </FormField>
        <FormField label="Tiền lương" {...fieldProps}>
          <MoneyInput
            value={draft.profile.salary}
            onChange={(v) =>
              onChange(setProfile(draft, { salary: v === "" ? 0 : v }))
            }
          />
        </FormField>
        <FormField label="Tiền đặt cọc" {...fieldProps}>
          <MoneyInput
            value={draft.profile.deposit}
            onChange={(v) =>
              onChange(setProfile(draft, { deposit: v === "" ? 0 : v }))
            }
          />
        </FormField>
      </div>
      <FormField label="Danh sách hồ sơ gốc" {...fieldProps}>
        <LargeTextInput
          value={draft.profile.originalDocumentsNote}
          placeholder="Ghi chú hồ sơ gốc đã nộp..."
          onChange={(e) =>
            onChange(
              setProfile(draft, { originalDocumentsNote: e.target.value }),
            )
          }
        />
      </FormField>
    </div>
  );
}
