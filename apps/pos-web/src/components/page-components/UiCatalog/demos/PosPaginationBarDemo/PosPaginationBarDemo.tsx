import { useState } from "react";
import { PosPaginationBar } from "@erp/pos/components/common/PosPaginationBar/PosPaginationBar";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

const TOTAL = 348;

export const PosPaginationBarDemo = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const totalPages = Math.max(1, Math.ceil(TOTAL / pageSize));

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      <PosPaginationBar
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        total={TOTAL}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onRefresh={() => setPage(1)}
      />
    </div>
  );
};

export const posPaginationBarEntry: CatalogEntry = {
  id: "pos-pagination-bar",
  name: "PosPaginationBar",
  category: "display",
  importPath: "@erp/pos/components/common/PosPaginationBar/PosPaginationBar",
  description:
    "Thanh phân trang dưới bảng: nút đầu/trước/sau/cuối, làm mới, chọn số dòng/trang, và dòng “x-y/tổng kết quả”. Nút trơ khi không truyền callback.",
  props: [
    { name: "page", type: "number", required: true, description: "Trang hiện tại (bắt đầu từ 1)." },
    { name: "totalPages", type: "number", required: true, description: "Tổng số trang." },
    { name: "pageSize", type: "number", required: true, description: "Số dòng mỗi trang." },
    { name: "total", type: "number", required: true, description: "Tổng số bản ghi." },
    { name: "pageSizeOptions", type: "number[]", required: false, defaultValue: "[50, 100, 200]", description: "Các lựa chọn số dòng/trang." },
    { name: "onPageChange", type: "(page: number) => void", required: false, description: "Gọi khi đổi trang." },
    { name: "onPageSizeChange", type: "(size: number) => void", required: false, description: "Gọi khi đổi số dòng/trang." },
    { name: "onRefresh", type: "() => void", required: false, description: "Gọi khi bấm làm mới." },
  ],
  usageNotes: [
    "Thuần hiển thị — host giữ state page/pageSize và truyền callback.",
    "Đổi pageSize thường nên reset page về 1.",
    "Bên trong dùng PosPaginationButton cho từng nút điều hướng.",
  ],
  code: `const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(50);

<PosPaginationBar
  page={page}
  totalPages={Math.ceil(total / pageSize)}
  pageSize={pageSize}
  total={total}
  onPageChange={setPage}
  onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
/>`,
  Demo: PosPaginationBarDemo,
};
