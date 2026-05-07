import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  AppModal,
  Button,
  FormField,
  Input,
} from "@erp/ui";
import { ColumnFilterInlineField } from "../../../table/ColumnFilterModeControl";
import {
  applyColumnFilter,
  clampPage,
  DEFAULT_COLUMN_FILTER_MODE,
  toComparableText,
  type ColumnFilter,
} from "../../../table/pagination.dto";
import { BRAND_SUGGESTIONS, GROUP_SUGGESTIONS } from "./constants";

interface InventoryItemCreateDialogsProps {
  categoryPickOpen: boolean;
  setCategoryPickOpen: Dispatch<SetStateAction<boolean>>;
  categoryOptions: string[];
  handlePickCategory: (label: string) => void;
  quickCategoryOpen: boolean;
  setQuickCategoryOpen: Dispatch<SetStateAction<boolean>>;
  quickCategoryDraft: string;
  setQuickCategoryDraft: Dispatch<SetStateAction<string>>;
  providerPickOpen: boolean;
  setProviderPickOpen: Dispatch<SetStateAction<boolean>>;
  providerSearch: string;
  setProviderSearch: Dispatch<SetStateAction<string>>;
  providersLoading: boolean;
  providerFetch: { data?: Record<string, unknown>[] } | null | undefined;
  handlePickProvider: (row: Record<string, unknown>) => void;
  quickProviderOpen: boolean;
  setQuickProviderOpen: Dispatch<SetStateAction<boolean>>;
  quickProviderCode: string;
  setQuickProviderCode: Dispatch<SetStateAction<string>>;
  quickProviderName: string;
  setQuickProviderName: Dispatch<SetStateAction<string>>;
  createProviderMutation: {
    isPending: boolean;
    mutateAsync: (payload: { code: string; name: string; isActive: boolean }) => Promise<unknown>;
  };
  groupPickOpen: boolean;
  setGroupPickOpen: Dispatch<SetStateAction<boolean>>;
  quickGroupOpen: boolean;
  setQuickGroupOpen: Dispatch<SetStateAction<boolean>>;
  quickGroupDraft: string;
  setQuickGroupDraft: Dispatch<SetStateAction<string>>;
  brandPickOpen: boolean;
  setBrandPickOpen: Dispatch<SetStateAction<boolean>>;
  quickBrandOpen: boolean;
  setQuickBrandOpen: Dispatch<SetStateAction<boolean>>;
  quickBrandDraft: string;
  setQuickBrandDraft: Dispatch<SetStateAction<string>>;
  setValues: Dispatch<SetStateAction<Record<string, unknown>>>;
  onApplyQuickCategory: () => Promise<void>;
  isApplyingQuickCategory: boolean;
}

const emptyFilter = (): ColumnFilter => ({
  mode: DEFAULT_COLUMN_FILTER_MODE,
  value: "",
});

function providerRowSearchText(row: Record<string, unknown>): string {
  return [row.code, row.name, row.email]
    .map((v) => toComparableText(v ?? ""))
    .join(" ");
}

const PICKER_PAGE_SIZE = 20;

function paginateList<T>(items: T[], page: number, pageSize = PICKER_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = clampPage(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    pagedItems: items.slice(start, start + pageSize),
  };
}

function PickerPagination({
  page,
  totalPages,
  totalItems,
  onChangePage,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onChangePage: (nextPage: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t px-2 py-2 text-xs text-muted-foreground">
      <span>
        Tổng: <strong>{totalItems}</strong> mục
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onChangePage(page - 1)}>
          Trước
        </Button>
        <span>
          Trang {page}/{totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onChangePage(page + 1)}
        >
          Sau
        </Button>
      </div>
    </div>
  );
}

export function InventoryItemCreateDialogs({
  categoryPickOpen,
  setCategoryPickOpen,
  categoryOptions,
  handlePickCategory,
  quickCategoryOpen,
  setQuickCategoryOpen,
  quickCategoryDraft,
  setQuickCategoryDraft,
  providerPickOpen,
  setProviderPickOpen,
  providerSearch,
  setProviderSearch,
  providersLoading,
  providerFetch,
  handlePickProvider,
  quickProviderOpen,
  setQuickProviderOpen,
  quickProviderCode,
  setQuickProviderCode,
  quickProviderName,
  setQuickProviderName,
  createProviderMutation,
  groupPickOpen,
  setGroupPickOpen,
  quickGroupOpen,
  setQuickGroupOpen,
  quickGroupDraft,
  setQuickGroupDraft,
  brandPickOpen,
  setBrandPickOpen,
  quickBrandOpen,
  setQuickBrandOpen,
  quickBrandDraft,
  setQuickBrandDraft,
  setValues,
  onApplyQuickCategory,
  isApplyingQuickCategory,
}: InventoryItemCreateDialogsProps) {
  const [categoryFilter, setCategoryFilter] = useState<ColumnFilter>(emptyFilter);
  const [categoryStaged, setCategoryStaged] = useState<string | null>(null);
  const [categoryPage, setCategoryPage] = useState(1);

  const [groupFilter, setGroupFilter] = useState<ColumnFilter>(emptyFilter);
  const [groupStaged, setGroupStaged] = useState<string | null>(null);
  const [groupPage, setGroupPage] = useState(1);

  const [brandFilter, setBrandFilter] = useState<ColumnFilter>(emptyFilter);
  const [brandStaged, setBrandStaged] = useState<string | null>(null);
  const [brandPage, setBrandPage] = useState(1);

  const [providerPickFilter, setProviderPickFilter] = useState<ColumnFilter>(emptyFilter);
  const [providerStagedRow, setProviderStagedRow] = useState<Record<string, unknown> | null>(null);
  const [providerPage, setProviderPage] = useState(1);

  useEffect(() => {
    if (!categoryPickOpen) return;
    setCategoryFilter(emptyFilter());
    setCategoryStaged(null);
    setCategoryPage(1);
  }, [categoryPickOpen]);

  useEffect(() => {
    if (!groupPickOpen) return;
    setGroupFilter(emptyFilter());
    setGroupStaged(null);
    setGroupPage(1);
  }, [groupPickOpen]);

  useEffect(() => {
    if (!brandPickOpen) return;
    setBrandFilter(emptyFilter());
    setBrandStaged(null);
    setBrandPage(1);
  }, [brandPickOpen]);

  useEffect(() => {
    if (!providerPickOpen) return;
    setProviderPickFilter({
      mode: DEFAULT_COLUMN_FILTER_MODE,
      value: providerSearch,
    });
    setProviderStagedRow(null);
    setProviderPage(1);
  }, [providerPickOpen]);

  useEffect(() => {
    if (!providerPickOpen) return;
    setProviderSearch(providerPickFilter.value);
  }, [providerPickFilter.value, providerPickOpen, setProviderSearch]);

  useEffect(() => {
    setCategoryPage(1);
  }, [categoryFilter.mode, categoryFilter.value]);

  useEffect(() => {
    setGroupPage(1);
  }, [groupFilter.mode, groupFilter.value]);

  useEffect(() => {
    setBrandPage(1);
  }, [brandFilter.mode, brandFilter.value]);

  useEffect(() => {
    setProviderPage(1);
  }, [providerPickFilter.mode, providerPickFilter.value]);

  const filteredCategoryOptions = useMemo(() => {
    return categoryOptions.filter((c) => applyColumnFilter(toComparableText(c), categoryFilter));
  }, [categoryOptions, categoryFilter]);
  const categoryPageData = useMemo(
    () => paginateList(filteredCategoryOptions, categoryPage),
    [filteredCategoryOptions, categoryPage],
  );

  const filteredGroupSuggestions = useMemo(() => {
    return GROUP_SUGGESTIONS.filter((g) => applyColumnFilter(toComparableText(g), groupFilter));
  }, [groupFilter]);
  const groupPageData = useMemo(
    () => paginateList(filteredGroupSuggestions, groupPage),
    [filteredGroupSuggestions, groupPage],
  );

  const filteredBrandSuggestions = useMemo(() => {
    return BRAND_SUGGESTIONS.filter((b) => applyColumnFilter(toComparableText(b), brandFilter));
  }, [brandFilter]);
  const brandPageData = useMemo(
    () => paginateList(filteredBrandSuggestions, brandPage),
    [filteredBrandSuggestions, brandPage],
  );

  const providerRows = providerFetch?.data ?? [];

  const filteredProviderRows = useMemo(() => {
    return providerRows.filter((row) => applyColumnFilter(providerRowSearchText(row), providerPickFilter));
  }, [providerRows, providerPickFilter]);
  const providerPageData = useMemo(
    () => paginateList(filteredProviderRows, providerPage),
    [filteredProviderRows, providerPage],
  );

  return (
    <>
      <AppModal
        open={categoryPickOpen}
        onOpenChange={setCategoryPickOpen}
        title="Chọn danh mục"
        description={
          <>
            Danh sách gồm danh mục đã lưu và danh mục suy ra từ mặt hàng hiện có. Chọn một dòng rồi bấm Áp dụng
            để điền vào biểu mẫu.
          </>
        }
        defaultHeight={480}
        onSave={() => {
          if (categoryStaged) {
            handlePickCategory(categoryStaged);
            setCategoryPickOpen(false);
          }
        }}
        saveDisabled={!categoryStaged}
      >
        <div className="flex h-full min-h-0 flex-col gap-2">
          <ColumnFilterInlineField
            fieldLabel="danh mục trong danh sách"
            filter={categoryFilter}
            onModeChange={(mode) => setCategoryFilter((f) => ({ ...f, mode }))}
            onValueChange={(value) => setCategoryFilter((f) => ({ ...f, value }))}
            placeholder="Tìm trong danh sách…"
          />
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md border p-2">
            {categoryOptions.length === 0 ? (
              <li className="text-sm text-muted-foreground">Chưa có danh mục nào trong hệ thống.</li>
            ) : filteredCategoryOptions.length === 0 ? (
              <li className="text-sm text-muted-foreground">Không có mục khớp bộ lọc.</li>
            ) : (
              categoryPageData.pagedItems.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${
                      categoryStaged === c ? "bg-accent ring-1 ring-ring" : ""
                    }`}
                    onClick={() => setCategoryStaged(c)}
                  >
                    {c}
                  </button>
                </li>
              ))
            )}
          </ul>
          <PickerPagination
            page={categoryPageData.page}
            totalPages={categoryPageData.totalPages}
            totalItems={filteredCategoryOptions.length}
            onChangePage={setCategoryPage}
          />
        </div>
      </AppModal>

      <AppModal
        open={quickCategoryOpen}
        onOpenChange={setQuickCategoryOpen}
        title="Thêm nhanh danh mục"
        description="Tạo danh mục ngay bây giờ và điền vào ô Danh mục trên biểu mẫu."
        defaultWidth={520}
        defaultHeight={280}
        saveLabel={isApplyingQuickCategory ? "Đang tạo…" : "Áp dụng"}
        saveDisabled={isApplyingQuickCategory || !quickCategoryDraft.trim()}
        onSave={() => void onApplyQuickCategory()}
      >
        <div className="grid gap-2">
          <Input
            value={quickCategoryDraft}
            onChange={(e) => setQuickCategoryDraft(e.target.value)}
            placeholder="Tên danh mục"
          />
        </div>
      </AppModal>

      <AppModal
        open={providerPickOpen}
        onOpenChange={setProviderPickOpen}
        title="Tìm nhà cung cấp"
        description={
          <>
            Chọn ký hiệu lọc (*, =, +, -, !) rồi nhập giá trị — chuỗi tìm gửi lên máy chủ; danh sách bên dưới
            thu hẹp theo cùng kiểu lọc. Chọn một dòng rồi bấm Áp dụng.
          </>
        }
        defaultWidth={640}
        defaultHeight={520}
        onSave={() => {
          if (providerStagedRow) {
            handlePickProvider(providerStagedRow);
            setProviderPickOpen(false);
          }
        }}
        saveDisabled={!providerStagedRow}
      >
        <div className="flex h-full min-h-0 flex-col gap-2">
          <ColumnFilterInlineField
            fieldLabel="nhà cung cấp"
            filter={providerPickFilter}
            onModeChange={(mode) => setProviderPickFilter((f) => ({ ...f, mode }))}
            onValueChange={(value) => setProviderPickFilter((f) => ({ ...f, value }))}
            placeholder="Tìm trong danh sách…"
          />
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
            {providersLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Mã</th>
                    <th className="px-2 py-2 text-left font-medium">Tên</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProviderRows.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-2 py-4 text-center text-sm text-muted-foreground">
                        Không có kết quả phù hợp.
                      </td>
                    </tr>
                  ) : (
                    providerPageData.pagedItems.map((row) => {
                      const id = String(row.id);
                      const sel = providerStagedRow && String(providerStagedRow.id) === id;
                      return (
                        <tr
                          key={id}
                          className={`cursor-pointer border-t border-border hover:bg-accent/50 ${
                            sel ? "bg-accent/60 ring-1 ring-inset ring-ring" : ""
                          }`}
                          onClick={() => setProviderStagedRow(row)}
                        >
                          <td className="px-2 py-2">{String(row.code ?? "")}</td>
                          <td className="px-2 py-2">{String(row.name ?? "")}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
          <PickerPagination
            page={providerPageData.page}
            totalPages={providerPageData.totalPages}
            totalItems={filteredProviderRows.length}
            onChangePage={setProviderPage}
          />
        </div>
      </AppModal>

      <AppModal
        open={quickProviderOpen}
        onOpenChange={setQuickProviderOpen}
        title="Thêm nhà cung cấp mới"
        description='Tạo NCC trong danh mục "Nhà cung cấp", sau đó tự gán cho mặt hàng này.'
        defaultWidth={560}
        defaultHeight={340}
        saveLabel={createProviderMutation.isPending ? "Đang tạo…" : "Áp dụng"}
        saveDisabled={
          createProviderMutation.isPending || !quickProviderCode.trim() || !quickProviderName.trim()
        }
        onSave={async () => {
          const created = await createProviderMutation.mutateAsync({
            code: quickProviderCode.trim(),
            name: quickProviderName.trim(),
            isActive: true,
          });
          handlePickProvider(created as Record<string, unknown>);
          setQuickProviderOpen(false);
        }}
      >
        <div className="grid gap-3">
          <FormField label="Mã NCC" htmlFor="qp-code">
            <Input
              id="qp-code"
              value={quickProviderCode}
              onChange={(e) => setQuickProviderCode(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Tên NCC" htmlFor="qp-name">
            <Input
              id="qp-name"
              value={quickProviderName}
              onChange={(e) => setQuickProviderName(e.target.value)}
              required
            />
          </FormField>
        </div>
      </AppModal>

      <AppModal
        open={groupPickOpen}
        onOpenChange={setGroupPickOpen}
        title="Gợi ý nhóm hàng hóa"
        description="Chọn một dòng rồi bấm Áp dụng để điền vào biểu mẫu."
        defaultHeight={420}
        onSave={() => {
          if (groupStaged) {
            setValues((prev) => ({ ...prev, itemType: groupStaged }));
            setGroupPickOpen(false);
          }
        }}
        saveDisabled={!groupStaged}
      >
        <div className="flex h-full min-h-0 flex-col gap-2">
          <ColumnFilterInlineField
            fieldLabel="nhóm hàng"
            filter={groupFilter}
            onModeChange={(mode) => setGroupFilter((f) => ({ ...f, mode }))}
            onValueChange={(value) => setGroupFilter((f) => ({ ...f, value }))}
            placeholder="Tìm trong danh sách…"
          />
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md border p-2">
            {filteredGroupSuggestions.length === 0 ? (
              <li className="text-sm text-muted-foreground">Không có mục khớp bộ lọc.</li>
            ) : (
              groupPageData.pagedItems.map((g) => (
                <li key={g}>
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${
                      groupStaged === g ? "bg-accent ring-1 ring-ring" : ""
                    }`}
                    onClick={() => setGroupStaged(g)}
                  >
                    {g}
                  </button>
                </li>
              ))
            )}
          </ul>
          <PickerPagination
            page={groupPageData.page}
            totalPages={groupPageData.totalPages}
            totalItems={filteredGroupSuggestions.length}
            onChangePage={setGroupPage}
          />
        </div>
      </AppModal>

      <AppModal
        open={quickGroupOpen}
        onOpenChange={setQuickGroupOpen}
        title="Nhập nhanh nhóm hàng"
        defaultWidth={520}
        defaultHeight={260}
        saveDisabled={!quickGroupDraft.trim()}
        onSave={() => {
          setValues((prev) => ({ ...prev, itemType: quickGroupDraft.trim() }));
          setQuickGroupOpen(false);
        }}
      >
        <Input
          value={quickGroupDraft}
          onChange={(e) => setQuickGroupDraft(e.target.value)}
          placeholder="Tên nhóm"
        />
      </AppModal>

      <AppModal
        open={brandPickOpen}
        onOpenChange={setBrandPickOpen}
        title="Gợi ý thương hiệu"
        description="Chọn một dòng rồi bấm Áp dụng để điền vào biểu mẫu."
        defaultHeight={420}
        onSave={() => {
          if (brandStaged) {
            setValues((prev) => ({ ...prev, brand: brandStaged }));
            setBrandPickOpen(false);
          }
        }}
        saveDisabled={!brandStaged}
      >
        <div className="flex h-full min-h-0 flex-col gap-2">
          <ColumnFilterInlineField
            fieldLabel="thương hiệu"
            filter={brandFilter}
            onModeChange={(mode) => setBrandFilter((f) => ({ ...f, mode }))}
            onValueChange={(value) => setBrandFilter((f) => ({ ...f, value }))}
            placeholder="Tìm trong danh sách…"
          />
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md border p-2">
            {filteredBrandSuggestions.length === 0 ? (
              <li className="text-sm text-muted-foreground">Không có mục khớp bộ lọc.</li>
            ) : (
              brandPageData.pagedItems.map((b) => (
                <li key={b}>
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${
                      brandStaged === b ? "bg-accent ring-1 ring-ring" : ""
                    }`}
                    onClick={() => setBrandStaged(b)}
                  >
                    {b}
                  </button>
                </li>
              ))
            )}
          </ul>
          <PickerPagination
            page={brandPageData.page}
            totalPages={brandPageData.totalPages}
            totalItems={filteredBrandSuggestions.length}
            onChangePage={setBrandPage}
          />
        </div>
      </AppModal>

      <AppModal
        open={quickBrandOpen}
        onOpenChange={setQuickBrandOpen}
        title="Nhập nhanh thương hiệu"
        defaultWidth={520}
        defaultHeight={260}
        saveDisabled={!quickBrandDraft.trim()}
        onSave={() => {
          setValues((prev) => ({ ...prev, brand: quickBrandDraft.trim() }));
          setQuickBrandOpen(false);
        }}
      >
        <Input
          value={quickBrandDraft}
          onChange={(e) => setQuickBrandDraft(e.target.value)}
          placeholder="Tên thương hiệu"
        />
      </AppModal>
    </>
  );
}
