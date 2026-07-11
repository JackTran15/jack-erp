import { useMemo } from "react";
import { ImportWizardDialog } from "../../../../components/shared/import-wizard/ImportWizardDialog";
import { ImportWizardComplete } from "../../../../components/shared/import-wizard/ImportWizardComplete";
import { buildCategoryImportReviewColumns } from "./import-category-review-columns";
import {
  cancelCategoriesImportJob,
  commitCategoriesImportJob,
  downloadCategoriesImportErrorRowsExcel,
  downloadCategoriesTemplate,
  validateCategoriesImportFile,
  type CategoryImportCommitResponse,
} from "./import-categories.api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted?: () => void;
}

const INTRO_BULLETS = [
  "Nhập khẩu danh mục nhóm hàng hóa từ phần mềm khác (MISA, Excel, CSV…).",
  "Hỗ trợ cây nhóm cha/con qua cột «Thuộc nhóm hàng hóa» (điền mã nhóm cha).",
  "Chọn Cập nhật hoặc Bỏ qua khi mã nhóm đã tồn tại trong hệ thống.",
  "Tải tệp mẫu, điền dữ liệu từ dòng 8 trên sheet «Danh sách nhóm hàng hóa».",
];

export function ImportCategoriesDialog({ open, onOpenChange, onCommitted }: Props) {
  const reviewColumns = useMemo(() => buildCategoryImportReviewColumns(), []);

  return (
    <ImportWizardDialog<CategoryImportCommitResponse>
      open={open}
      onOpenChange={onOpenChange}
      onCommitted={onCommitted}
      title="Nhập khẩu nhóm hàng hóa"
      introTitle="Nhập khẩu nhóm hàng hóa đáp ứng nhu cầu:"
      introBullets={INTRO_BULLETS}
      duplicateNoun="nhóm hàng hóa"
      api={{
        validate: validateCategoriesImportFile,
        commit: commitCategoriesImportJob,
        cancelJob: cancelCategoriesImportJob,
        downloadErrorRows: downloadCategoriesImportErrorRowsExcel,
        downloadTemplate: downloadCategoriesTemplate,
      }}
      reviewColumns={reviewColumns}
      renderComplete={(result) => (
        <ImportWizardComplete
          stats={[
            { value: result.categoriesCreated, label: "nhóm hàng hóa mới" },
            {
              value: result.categoriesUpdated,
              label: "nhóm hàng hóa được cập nhật",
            },
          ]}
        />
      )}
    />
  );
}
