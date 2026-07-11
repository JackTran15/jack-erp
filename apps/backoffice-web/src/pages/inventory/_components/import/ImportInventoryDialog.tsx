import { useMemo } from "react";
import {
  InventoryImportExcelField,
  ImportRowStatus,
} from "@erp/shared-interfaces";
import { ImportWizardDialog } from "../../../../components/shared/import-wizard/ImportWizardDialog";
import { ImportWizardComplete } from "../../../../components/shared/import-wizard/ImportWizardComplete";
import type { ImportJobRow } from "../../../../components/shared/import-wizard/types";
import {
  cancelImportJob,
  commitImportJob,
  downloadImportErrorRowsExcel,
  downloadInventoryTemplate,
  validateImportFile,
} from "./import-inventory.api";
import type { ImportCommitResponse } from "./import-inventory.types";
import { buildImportReviewPreviewColumns } from "./import-review-columns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted?: () => void;
}

const INTRO_BULLETS = [
  "Nhập khẩu hàng hóa từ phần mềm khác (MISA, Excel, CSV…).",
  "Hỗ trợ bảng giá, đơn vị chuyển đổi, kích thước và trọng lượng.",
  "Cập nhật vị trí lưu kho, trưng bày và thông tin bán hàng.",
  "Chọn Cập nhật hoặc Bỏ qua khi mã SKU đã tồn tại trong hệ thống.",
  "Tải tệp mẫu, điền dữ liệu từ dòng 5 trên sheet «Danh sách hàng hóa».",
];

function countDistinctModelNames(rows: ImportJobRow[]): number {
  const names = new Set<string>();
  for (const row of rows) {
    if (
      row.status !== ImportRowStatus.VALID &&
      row.status !== ImportRowStatus.COMMITTED
    ) {
      continue;
    }
    const name = String(
      row.rawData[InventoryImportExcelField.MODEL_NAME] ?? "",
    ).trim();
    if (name) names.add(name);
  }
  return names.size;
}

export function ImportInventoryDialog({ open, onOpenChange, onCommitted }: Props) {
  const reviewColumns = useMemo(() => buildImportReviewPreviewColumns(), []);

  return (
    <ImportWizardDialog<ImportCommitResponse>
      open={open}
      onOpenChange={onOpenChange}
      onCommitted={onCommitted}
      title="Nhập khẩu hàng hóa"
      introTitle="Cải tiến nhập khẩu hàng hóa đáp ứng nhu cầu:"
      introBullets={INTRO_BULLETS}
      duplicateNoun="hàng hóa"
      api={{
        validate: validateImportFile,
        commit: commitImportJob,
        cancelJob: cancelImportJob,
        downloadErrorRows: downloadImportErrorRowsExcel,
        downloadTemplate: downloadInventoryTemplate,
      }}
      reviewColumns={reviewColumns}
      renderComplete={(result) => (
        <ImportWizardComplete
          stats={[
            {
              value:
                result.productsCreated > 0
                  ? result.productsCreated
                  : countDistinctModelNames(result.rows),
              label: "mẫu mã",
            },
            { value: result.itemsCommitted, label: "hàng hóa" },
          ]}
        />
      )}
    />
  );
}
