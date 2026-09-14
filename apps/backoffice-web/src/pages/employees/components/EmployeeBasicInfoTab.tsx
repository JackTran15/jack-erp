import { DateTimeField, FormField, FormFieldProps, Input, cn } from "@erp/ui";
import { RadioGroup } from "../../../components/forms/RadioGroup";
import { Eye, EyeOff, Loader2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMediaUpload } from "../../../lib/media/useMediaUpload";
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
  isGeneratingCode?: boolean;
  /** Whether the employee record (edit mode) has finished loading; always true in create mode. Gates the photo picker's trigger button so it can't fire before `currentPhoto` reflects the real record. */
  isRecordReady: boolean;
  onPhotoUploadingChange: (isUploading: boolean) => void;
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

export function EmployeeBasicInfoTab({
  draft,
  onChange,
  isEdit,
  isGeneratingCode = false,
  isRecordReady,
  onPhotoUploadingChange,
}: EmployeeBasicInfoTabProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { basic } = draft;

  /**
   * Single write path for the toggle. `draft.basic.changePassword` is what
   * buildUserUpdatePayload reads to decide whether to call reset-password, so
   * the flag has to live in the draft — a component-local copy silently drops
   * the new password on save.
   */
  const handleChangePasswordToggle = (checked: boolean) => {
    onChange(
      setBasic(draft, {
        changePassword: checked,
        ...(checked ? {} : { password: "", confirmPassword: "" }),
      }),
    );
    if (!checked) {
      setShowPassword(false);
      setShowConfirm(false);
    }
  };

  const { files: photoFiles, add: addPhoto, remove: removePhoto, isUploading: isUploadingPhoto } =
    useMediaUpload("EMPLOYEE_PROFILE", basic.currentPhoto ? [basic.currentPhoto] : undefined);

  const activePhoto = photoFiles.find((f) => f.status !== "error");
  const photoError = [...photoFiles].reverse().find((f) => f.status === "error")?.error;
  const uploadedPhotoMediaId = photoFiles.find((f) => f.status === "done")?.mediaId;
  const currentPhotoId = basic.currentPhoto?.id;
  const hasPendingPhotoUpload = photoFiles.some((f) => f.status === "uploading");

  /**
   * Mirrors the hook's attachment state into `photoMediaId`, the field the
   * save payload actually reads. Only fires once an upload settles: while one
   * is in flight there is briefly no "done" entry even mid-replace, and
   * reacting to that would send `null` (delete) before the new id is known.
   */
  useEffect(() => {
    if (hasPendingPhotoUpload) return;
    const nextPhotoMediaId = uploadedPhotoMediaId
      ? uploadedPhotoMediaId === currentPhotoId
        ? undefined
        : uploadedPhotoMediaId
      : currentPhotoId
        ? null
        : undefined;
    if (nextPhotoMediaId !== basic.photoMediaId) {
      onChange(setBasic(draft, { photoMediaId: nextPhotoMediaId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedPhotoMediaId, currentPhotoId, hasPendingPhotoUpload]);

  useEffect(() => {
    onPhotoUploadingChange(isUploadingPhoto);
  }, [isUploadingPhoto, onPhotoUploadingChange]);

  const handlePhoto = (file: File | undefined) => {
    if (!file) return;
    addPhoto([file]);
  };

  const handleRemovePhoto = () => {
    if (activePhoto) removePhoto(activePhoto.localId);
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
              placeholder={
                isGeneratingCode ? "Đang sinh mã..." : "VD: NV000002"
              }
              disabled={isGeneratingCode}
              onChange={(e) =>
                onChange(setBasic(draft, { code: e.target.value }))
              }
            />
          </FormField>
          <FormField label="Email đăng nhập" required {...fieldProps}>
            <Input
              type="email"
              value={basic.email}
              readOnly={isEdit}
              className={isEdit ? "bg-muted/40" : undefined}
              onChange={(e) =>
                onChange(setBasic(draft, { email: e.target.value }))
              }
            />
          </FormField>
          <FormField label="ĐT di động" {...fieldProps}>
            <Input
              value={basic.mobile}
              placeholder="VD: 0900000000"
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
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              handlePhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="relative h-28 w-full">
            <button
              type="button"
              disabled={!isRecordReady || Boolean(activePhoto)}
              className={cn(
                "flex h-28 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input",
                "bg-muted/20 px-2 text-center text-xs text-muted-foreground hover:bg-muted/40 disabled:cursor-default disabled:opacity-70",
              )}
              onClick={() => fileRef.current?.click()}
            >
              {activePhoto ? (
                <img
                  src={activePhoto.previewUrl}
                  alt=""
                  className="max-h-24 max-w-full object-contain"
                />
              ) : !isRecordReady ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin opacity-50" />
                  <span>Đang tải...</span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 opacity-50" />
                  <span>
                    Định dạng ảnh (.jpg, .jpeg, .png, .webp) và dung lượng tối đa 5MB
                  </span>
                </>
              )}
            </button>
            {activePhoto && (
              <button
                type="button"
                aria-label="Bỏ ảnh"
                className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-muted-foreground hover:text-destructive"
                onClick={handleRemovePhoto}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {activePhoto?.status === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/40">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          {photoError && !activePhoto && (
            <p className="text-xs text-destructive">{photoError}</p>
          )}
          {isUploadingPhoto && (
            <p className="text-xs text-muted-foreground">Đang tải ảnh lên...</p>
          )}
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

      {isEdit && (
        <FormField label="" layout="horizontal" labelWidth={FORM_LABEL_WIDTH}>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={basic.changePassword}
              onChange={(e) => handleChangePasswordToggle(e.target.checked)}
            />
            Đổi mật khẩu
          </label>
        </FormField>
      )}

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
        {((!isEdit && basic.allowSoftwareAccess) ||
          (isEdit && basic.changePassword)) && (
          <>
            <FormField label="Mật khẩu" required {...fieldProps}>
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
            <FormField label="Xác nhận MK" required {...fieldProps}>
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
