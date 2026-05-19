import { DateTimeField, FormField, FormFieldProps, Input, cn } from "@erp/ui";
import { Eye, EyeOff, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { formatEmploymentStatus } from "../employee.mappers";
import {
  EmploymentStatusEnum,
  GenderEnum,
  MaritalStatusEnum,
  type EmployeeFormDraft,
} from "../employee.types";

interface EmployeeBasicInfoTabProps {
  draft: EmployeeFormDraft;
  onChange: (draft: EmployeeFormDraft) => void;
  isEdit: boolean;
}

const EMPLOYMENT_OPTIONS = Object.values(EmploymentStatusEnum);
const FORM_LABEL_WIDTH = "9.5rem";

function setBasic(
  draft: EmployeeFormDraft,
  patch: Partial<EmployeeFormDraft["basic"]>,
): EmployeeFormDraft {
  return { ...draft, basic: { ...draft.basic, ...patch } };
}

function PasswordInput({
  value,
  onChange,
  show,
  onToggleShow,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        onClick={onToggleShow}
        aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function RadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-4 pt-2 text-sm">
      {options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2">
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export function EmployeeBasicInfoTab({
  draft,
  onChange,
  isEdit,
}: EmployeeBasicInfoTabProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { basic } = draft;

  const handlePhoto = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    onChange(setBasic(draft, { photoDataUrl: url }));
  };

  const fieldProps: Partial<FormFieldProps> = {
    layout: "horizontal",
    labelWidth: FORM_LABEL_WIDTH,
  };

  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <div className="space-y-3">
          <FormField label="Mã nhân viên" required {...fieldProps}>
            <Input
              value={basic.code}
              onChange={(e) =>
                onChange(setBasic(draft, { code: e.target.value }))
              }
            />
          </FormField>
          <FormField label="Email" {...fieldProps}>
            <Input
              type="email"
              value={basic.email}
              onChange={(e) =>
                onChange(setBasic(draft, { email: e.target.value }))
              }
            />
          </FormField>
          <FormField label="ĐT di động" {...fieldProps}>
            <Input
              value={basic.mobile}
              onChange={(e) =>
                onChange(setBasic(draft, { mobile: e.target.value }))
              }
            />
          </FormField>
        </div>

        <FormField label="Ảnh nhân viên" layout="vertical">
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif"
            className="hidden"
            onChange={(e) => handlePhoto(e.target.files?.[0])}
          />
          <button
            type="button"
            className={cn(
              "flex h-28 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input",
              "bg-muted/20 px-2 text-center text-xs text-muted-foreground hover:bg-muted/40",
            )}
            onClick={() => fileRef.current?.click()}
          >
            {basic.photoDataUrl ? (
              <img
                src={basic.photoDataUrl}
                alt=""
                className="max-h-24 max-w-full object-contain"
              />
            ) : (
              <>
                <Upload className="h-8 w-8 opacity-50" />
                <span>
                  Định dạng ảnh (.jpg, .jpeg, .png, .gif) và dung lượng &lt; 5MB
                </span>
              </>
            )}
          </button>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-x-6">
        <FormField label="Tên nhân viên" required {...fieldProps}>
          <Input
            value={basic.fullName}
            onChange={(e) =>
              onChange(setBasic(draft, { fullName: e.target.value }))
            }
          />
        </FormField>
        <FormField label="Trạng thái làm việc" {...fieldProps}>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={basic.employmentStatus}
            onChange={(e) =>
              onChange(
                setBasic(draft, {
                  employmentStatus: e.target.value as EmploymentStatusEnum,
                }),
              )
            }
          >
            {EMPLOYMENT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {formatEmploymentStatus(s)}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label="" layout="horizontal" labelWidth={FORM_LABEL_WIDTH}>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={basic.allowSoftwareAccess}
            onChange={(e) =>
              onChange(
                setBasic(draft, { allowSoftwareAccess: e.target.checked }),
              )
            }
          />
          Cho phép làm việc với phần mềm
        </label>
      </FormField>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {basic.allowSoftwareAccess && (
          <>
            <FormField label="Mật khẩu" required={!isEdit} {...fieldProps}>
              <PasswordInput
                value={basic.password}
                show={showPassword}
                onToggleShow={() => setShowPassword((p) => !p)}
                placeholder="Ít nhất 8 ký tự"
                onChange={(value) =>
                  onChange(setBasic(draft, { password: value }))
                }
              />
            </FormField>
            <FormField label="Xác nhận MK" required={!isEdit} {...fieldProps}>
              <PasswordInput
                value={basic.confirmPassword}
                show={showConfirm}
                onToggleShow={() => setShowConfirm((p) => !p)}
                onChange={(value) =>
                  onChange(setBasic(draft, { confirmPassword: value }))
                }
              />
            </FormField>
          </>
        )}

        <FormField label="Số CMND" {...fieldProps}>
          <Input
            value={basic.idCardNumber}
            onChange={(e) =>
              onChange(setBasic(draft, { idCardNumber: e.target.value }))
            }
          />
        </FormField>
        <FormField label="Ngày cấp" {...fieldProps}>
          <DateTimeField
            value={basic.idCardIssueDate ?? ""}
            onChange={(e) =>
              onChange(
                setBasic(draft, {
                  idCardIssueDate: e.target.value || undefined,
                }),
              )
            }
            includeTime={false}
          />
        </FormField>

        <FormField label="Nơi cấp CMND" {...fieldProps}>
          <Input
            value={basic.idCardIssuePlace}
            onChange={(e) =>
              onChange(setBasic(draft, { idCardIssuePlace: e.target.value }))
            }
          />
        </FormField>
        <FormField label="Ngày sinh" {...fieldProps}>
          <DateTimeField
            value={basic.birthDate ?? ""}
            onChange={(e) =>
              onChange(
                setBasic(draft, { birthDate: e.target.value || undefined }),
              )
            }
            includeTime={false}
          />
        </FormField>

        <FormField label="Tình trạng hôn nhân" {...fieldProps}>
          <RadioGroup
            name="maritalStatus"
            value={basic.maritalStatus}
            options={[
              { value: MaritalStatusEnum.SINGLE, label: "Độc thân" },
              { value: MaritalStatusEnum.MARRIED, label: "Đã kết hôn" },
            ]}
            onChange={(value) =>
              onChange(setBasic(draft, { maritalStatus: value }))
            }
          />
        </FormField>
        <FormField label="Giới tính" {...fieldProps}>
          <RadioGroup
            name="gender"
            value={basic.gender}
            options={[
              { value: GenderEnum.MALE, label: "Nam" },
              { value: GenderEnum.FEMALE, label: "Nữ" },
            ]}
            onChange={(value) => onChange(setBasic(draft, { gender: value }))}
          />
        </FormField>
      </div>
    </div>
  );
}
