import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { FieldDefinition } from "@erp/shared-interfaces";
import { FormField, Input, MoneyInput } from "@erp/ui";
import { RadioGroup } from "../../forms/RadioGroup";
import { SearchListingInput } from "../../forms/SearchListingInput";
import { erpApi, requireErpData } from "../../../lib/erp-api";
import type { PaginatedResponse } from "@erp/shared-interfaces";

type ProviderType = "organization" | "individual";

const SALUTATION_OPTIONS = ["Ông", "Bà"];

interface Props {
  editableFields: FieldDefinition[];
  values: Record<string, unknown>;
  setValues: Dispatch<SetStateAction<Record<string, unknown>>>;
  errors: Record<string, string>;
  setErrors: Dispatch<SetStateAction<Record<string, string>>>;
  entityKey: string;
  isSaving?: boolean;
}

interface GroupItem {
  id: string;
  code: string;
  name: string;
}

export function SupplierCreateForm({ values, setValues, errors, setErrors }: Props) {
  const type = (values.type as ProviderType) ?? "organization";

  const [groupSearch, setGroupSearch] = useState("");
  const [groupSummary, setGroupSummary] = useState<{ name: string; code: string } | null>(null);

  // Prefill groupSummary from record on edit (values.groupId + values.groupName already loaded).
  // useRef flag ensures this runs exactly once when values first have a groupId, not on every re-render.
  const prefillDone = useRef(false);
  useEffect(() => {
    if (prefillDone.current) return;
    if (values.groupId && values.groupName) {
      prefillDone.current = true;
      setGroupSummary({ name: String(values.groupName), code: "" });
      setGroupSearch(String(values.groupName));
    }
  }, [values.groupId, values.groupName]);

  const searchGroups = useCallback(async (query: string): Promise<GroupItem[]> => {
    const response = await requireErpData(
      await erpApi.GET<PaginatedResponse<Record<string, unknown>>>(
        "/admin/entities/{entityKey}/records",
        {
          params: {
            path: { entityKey: "provider-groups" },
            query: { page: 1, pageSize: 8, search: query },
          },
        },
      ),
    );
    return response.data.map((r) => ({
      id: String(r.id ?? ""),
      code: String(r.code ?? ""),
      name: String(r.name ?? ""),
    }));
  }, []);

  function set(key: string, val: unknown) {
    setValues((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const codeDisplay = values.code ? String(values.code) : "(tự động)";
  const isOrg = type === "organization";

  return (
    <div className="space-y-4">
      {/* Type toggle */}
      <RadioGroup<ProviderType>
        name="supplier-type"
        value={type}
        options={[
          { value: "organization", label: "Tổ chức" },
          { value: "individual", label: "Cá nhân" },
        ]}
        onChange={(v) => set("type", v)}
      />

      {/* Two-column outer layout: basic info left, bank + contact right */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT — basic info */}
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Mã nhà cung cấp" htmlFor="sup-code">
            <Input id="sup-code" value={codeDisplay} disabled />
          </FormField>

          {isOrg ? (
            <FormField label="Tên nhà cung cấp" htmlFor="sup-name" required error={errors.name}>
              <Input
                id="sup-name"
                value={String(values.name ?? "")}
                onChange={(e) => set("name", e.target.value)}
              />
            </FormField>
          ) : (
            <FormField label="Họ và tên" htmlFor="sup-name" required error={errors.name}>
              <div className="flex gap-2">
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={String(values.salutation ?? "")}
                  onChange={(e) => set("salutation", e.target.value)}
                >
                  <option value="">--</option>
                  {SALUTATION_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <Input
                  id="sup-name"
                  className="flex-1"
                  value={String(values.name ?? "")}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
            </FormField>
          )}

          <FormField label="Địa chỉ" htmlFor="sup-address" error={errors.address}>
            <Input
              id="sup-address"
              value={String(values.address ?? "")}
              onChange={(e) => set("address", e.target.value)}
            />
          </FormField>

          {isOrg && (
            <FormField label="Mã số thuế" htmlFor="sup-taxcode" error={errors.taxCode}>
              <Input
                id="sup-taxcode"
                value={String(values.taxCode ?? "")}
                onChange={(e) => set("taxCode", e.target.value)}
              />
            </FormField>
          )}

          <FormField label="Điện thoại" htmlFor="sup-phone" error={errors.phone}>
            <Input
              id="sup-phone"
              value={String(values.phone ?? "")}
              onChange={(e) => set("phone", e.target.value)}
            />
          </FormField>

          <FormField label="Nhóm nhà cung cấp" htmlFor="sup-group">
            <SearchListingInput<GroupItem>
              inputId="sup-group"
              value={groupSearch}
              onValueChange={(v) => {
                setGroupSearch(v);
                if (!v) {
                  set("groupId", undefined);
                  setGroupSummary(null);
                }
              }}
              onSelect={(item) => {
                set("groupId", item.id);
                setGroupSummary({ name: item.name, code: item.code });
                setGroupSearch(`${item.code} · ${item.name}`);
              }}
              search={searchGroups}
              itemKey={(g) => g.id}
              renderItem={(g) => g.name}
              renderMeta={(g) => g.code}
              placeholder="Nhập để tìm kiếm…"
            />
            {groupSummary && (
              <p className="mt-0.5 text-xs text-muted-foreground">{groupSummary.name}</p>
            )}
          </FormField>

          <FormField label="Số nợ tối đa" htmlFor="sup-maxdebt">
            <MoneyInput
              id="sup-maxdebt"
              value={values.maxDebt === undefined || values.maxDebt === null || values.maxDebt === ""
                ? ""
                : Number(values.maxDebt)}
              onChange={(v) => set("maxDebt", v === "" ? undefined : v)}
            />
          </FormField>

          <FormField label="Hạn nợ (ngày)" htmlFor="sup-debtterm">
            <Input
              id="sup-debtterm"
              type="number"
              value={values.debtTermDays === undefined || values.debtTermDays === "" ? "" : String(values.debtTermDays)}
              onChange={(e) => set("debtTermDays", e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </FormField>

          {!isOrg && (
            <>
              <FormField label="Số CMND" htmlFor="sup-idcard" error={errors.idCardNumber}>
                <Input
                  id="sup-idcard"
                  value={String(values.idCardNumber ?? "")}
                  onChange={(e) => set("idCardNumber", e.target.value)}
                />
              </FormField>
              <FormField label="Ngày cấp CMND" htmlFor="sup-iddate">
                <Input
                  id="sup-iddate"
                  type="date"
                  value={values.idCardIssueDate ? String(values.idCardIssueDate).slice(0, 10) : ""}
                  onChange={(e) => set("idCardIssueDate", e.target.value || undefined)}
                />
              </FormField>
              <FormField label="Nơi cấp CMND" htmlFor="sup-idplace">
                <Input
                  id="sup-idplace"
                  value={String(values.idCardIssuePlace ?? "")}
                  onChange={(e) => set("idCardIssuePlace", e.target.value)}
                />
              </FormField>
            </>
          )}
        </div>

        {/* RIGHT — bank info + contact person + flags */}
        <div className="space-y-4">
          {/* Bank info */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Thông tin ngân hàng
            </p>
            <div className="grid gap-3">
              <FormField label="Ngân hàng" htmlFor="sup-bank">
                <Input
                  id="sup-bank"
                  value={String(values.bankName ?? "")}
                  onChange={(e) => set("bankName", e.target.value)}
                />
              </FormField>
              <FormField label="Số tài khoản" htmlFor="sup-bankacct">
                <Input
                  id="sup-bankacct"
                  value={String(values.bankAccountNumber ?? "")}
                  onChange={(e) => set("bankAccountNumber", e.target.value)}
                />
              </FormField>
              <FormField label="Chi nhánh NH" htmlFor="sup-bankbranch">
                <Input
                  id="sup-bankbranch"
                  value={String(values.bankBranch ?? "")}
                  onChange={(e) => set("bankBranch", e.target.value)}
                />
              </FormField>
            </div>
          </div>

          {/* Contact person (organization-only) */}
          {isOrg && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Người liên hệ
              </p>
              <div className="grid gap-3">
                <FormField label="Họ và tên" htmlFor="sup-cname">
                  <div className="flex gap-2">
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={String(values.contactTitle ?? "")}
                      onChange={(e) => set("contactTitle", e.target.value)}
                    >
                      <option value="">--</option>
                      {SALUTATION_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <Input
                      id="sup-cname"
                      className="flex-1"
                      value={String(values.contactName ?? "")}
                      onChange={(e) => set("contactName", e.target.value)}
                    />
                  </div>
                </FormField>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Email" htmlFor="sup-cemail">
                    <Input
                      id="sup-cemail"
                      type="email"
                      value={String(values.contactEmail ?? "")}
                      onChange={(e) => set("contactEmail", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Điện thoại" htmlFor="sup-cphone">
                    <Input
                      id="sup-cphone"
                      value={String(values.contactPhone ?? "")}
                      onChange={(e) => set("contactPhone", e.target.value)}
                    />
                  </FormField>
                </div>
                <FormField label="Chức danh" htmlFor="sup-cposition">
                  <Input
                    id="sup-cposition"
                    value={String(values.contactPosition ?? "")}
                    onChange={(e) => set("contactPosition", e.target.value)}
                  />
                </FormField>
                <FormField label="Địa chỉ" htmlFor="sup-caddress">
                  <Input
                    id="sup-caddress"
                    value={String(values.contactAddress ?? "")}
                    onChange={(e) => set("contactAddress", e.target.value)}
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* Flags */}
          <div className="flex flex-wrap gap-6 pt-1">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(values.isCustomer)}
                onChange={(e) => set("isCustomer", e.target.checked)}
                className="h-4 w-4 rounded border border-input accent-primary"
              />
              Là khách hàng
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.isActive === undefined ? true : Boolean(values.isActive)}
                onChange={(e) => set("isActive", e.target.checked)}
                className="h-4 w-4 rounded border border-input accent-primary"
              />
              Đang theo dõi
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
