import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@erp/ui";
import { ArrowLeft, Search } from "lucide-react";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ItemCategoryTreeSelect } from "./_components/ItemCategoryTreeSelect";
import { ProductImageTable } from "./_components/ProductImageTable";
import {
  RowImageUploadButton,
  type RowImageUploadDone,
} from "./_components/RowImageUploadButton";
import {
  useProductImages,
  type ProductImageRow,
  type ProductImageSearchBody,
  type ProductImageSearchResponse,
  type ProductImageStatus,
} from "./_lib/product-images.api";

const DEFAULT_LIMIT = 50;

const IMAGE_STATUS_OPTIONS: ReadonlyArray<{
  value: ProductImageStatus;
  label: string;
}> = [
  { value: "ALL", label: "Tất cả" },
  { value: "MISSING", label: "Hàng hóa chưa cập nhật ảnh" },
  { value: "PRESENT", label: "Hàng hóa đã cập nhật ảnh" },
];

/** Bộ lọc đã chốt ở lần bấm "Lấy dữ liệu" gần nhất — là input của query (A-11). */
type SubmittedFilters = Pick<
  ProductImageSearchBody,
  "imageStatus" | "categoryId" | "keyword"
>;

const DEFAULT_FILTERS: SubmittedFilters = {
  imageStatus: "MISSING",
  categoryId: null,
  keyword: "",
};

function sameFilters(a: SubmittedFilters, b: SubmittedFilters): boolean {
  return (
    a.imageStatus === b.imageStatus &&
    a.categoryId === b.categoryId &&
    a.keyword === b.keyword
  );
}

/**
 * Trang "Cập nhật ảnh" (Danh mục > Hàng hoá > Tiện ích): lọc nhóm hàng hoá theo
 * trạng thái ảnh / nhóm / từ khoá, xem thumbnail và tải ảnh cho từng dòng.
 * Mount ⇒ tự tải với bộ lọc mặc định; đổi bộ lọc ⇒ chờ bấm "Lấy dữ liệu";
 * đổi trang / số dòng ⇒ tải ngay.
 */
export function InventoryItemImagesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Bộ lọc đang chỉnh trên form (chưa áp dụng).
  const [imageStatus, setImageStatus] = useState<ProductImageStatus>(
    DEFAULT_FILTERS.imageStatus,
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    DEFAULT_FILTERS.categoryId,
  );
  const [keyword, setKeyword] = useState(DEFAULT_FILTERS.keyword);

  const [submitted, setSubmitted] = useState<SubmittedFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  const body = useMemo<ProductImageSearchBody>(
    () => ({ page, limit, ...submitted }),
    [page, limit, submitted],
  );
  const query = useProductImages(body);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: SubmittedFilters = {
      imageStatus,
      categoryId,
      keyword: keyword.trim(),
    };
    if (sameFilters(next, submitted) && page === 1) {
      // Cùng khoá query ⇒ React Query không tự chạy lại; ép tải lại.
      void query.refetch();
      return;
    }
    setSubmitted(next);
    setPage(1);
  };

  /**
   * Sau khi Tải ảnh: cập nhật dòng tại chỗ (xem trước bằng object URL) rồi
   * refetch để lấy thumbnail công khai thật; với bộ lọc MISSING dòng vừa có
   * ảnh biến mất sau refetch — đúng ý. Object URL được thu hồi sau refetch.
   */
  const handleRowDone = (row: ProductImageRow, done: RowImageUploadDone) => {
    queryClient.setQueryData<ProductImageSearchResponse>(
      ["product-images", body],
      (prev) =>
        prev && {
          ...prev,
          data: prev.data.map((r) =>
            r.type === row.type && r.id === row.id
              ? { ...r, thumbnailUrl: done.thumbnailUrl, imageCount: done.imageCount }
              : r,
          ),
        },
    );
    void queryClient
      .invalidateQueries({ queryKey: ["product-images"] })
      .finally(() => {
        if (done.thumbnailUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(done.thumbnailUrl);
        }
      });
  };

  const rows = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const errorMessage = query.isError
    ? query.error instanceof Error
      ? query.error.message
      : "Tải dữ liệu thất bại"
    : null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-2.5 overflow-hidden">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        <header className="border-b px-4 py-3">
          <h1 className="text-base font-bold text-foreground">Cập nhật ảnh</h1>
        </header>

        {/* Hàng bộ lọc */}
        <form
          className="flex flex-wrap items-end gap-3 border-b bg-muted/40 px-4 py-3"
          onSubmit={handleSubmit}
        >
          <label className="flex min-w-[220px] flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Tìm kiếm theo
            </span>
            <Select
              value={imageStatus}
              onValueChange={(v) => setImageStatus(v as ProductImageStatus)}
            >
              <SelectTrigger className="h-9" aria-label="Tìm kiếm theo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex min-w-[220px] flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Nhóm hàng hóa
            </span>
            <ItemCategoryTreeSelect value={categoryId} onChange={setCategoryId} />
          </label>

          <label className="flex min-w-[280px] flex-1 flex-col gap-1 text-sm">
            <span className="sr-only">Mã SKU hoặc tên hàng hóa</span>
            <Input
              type="text"
              value={keyword}
              maxLength={200}
              autoComplete="off"
              placeholder="Nhập mã SKU hoặc tên hàng hóa..."
              className="h-9"
              onChange={(e) => setKeyword(e.target.value)}
            />
          </label>

          <Button type="submit" className="h-9" disabled={query.isFetching}>
            <Search className="mr-1.5 h-4 w-4" aria-hidden />
            Lấy dữ liệu
          </Button>
        </form>

        {/* Bảng */}
        <div className="min-h-0 flex-1 overflow-auto">
          <ProductImageTable
            rows={rows}
            loading={query.isPending || query.isFetching}
            errorMessage={errorMessage}
            onRetry={() => void query.refetch()}
            renderRowAction={(row) => (
              <RowImageUploadButton
                row={row}
                onDone={(done) => handleRowDone(row, done)}
              />
            )}
          />
        </div>

        {/* Chân trang */}
        {query.data && !query.isError ? (
          <PaginationControls
            page={page}
            pageSize={limit}
            total={total}
            disabled={query.isFetching}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
            onRefresh={() => void query.refetch()}
          />
        ) : null}
      </section>

      <div className="flex items-center">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("/admin/inventory-items")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
          Quay lại
        </Button>
      </div>
    </div>
  );
}
