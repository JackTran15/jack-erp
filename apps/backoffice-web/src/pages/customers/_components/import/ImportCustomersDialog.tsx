import { useMemo } from "react";
import { ImportWizardDialog } from "../../../../components/shared/import-wizard/ImportWizardDialog";
import { ImportWizardComplete } from "../../../../components/shared/import-wizard/ImportWizardComplete";
import { buildCustomerImportReviewColumns } from "./import-customer-review-columns";
import {
  cancelCustomersImportJob,
  commitCustomersImportJob,
  downloadCustomersImportErrorRowsExcel,
  downloadCustomersTemplate,
  validateCustomersImportFile,
} from "./import-customers.api";
import type { CustomerImportCommitResponse } from "./import-customers.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted?: () => void;
}

const INTRO_BULLETS = [
  "Nhập khẩu danh mục khách hàng từ phần mềm khác (MISA, Excel, CSV…).",
  "Hỗ trợ nhóm khách hàng, thẻ thành viên và nhân viên phụ trách.",
  "Chọn Cập nhật hoặc Bỏ qua khi mã khách hàng đã tồn tại trong hệ thống.",
  "Tải tệp mẫu, điền dữ liệu từ dòng 5 trên sheet «Danh sách khách hàng».",
];

export function ImportCustomersDialog({ open, onOpenChange, onCommitted }: Props) {
  const reviewColumns = useMemo(() => buildCustomerImportReviewColumns(), []);

  return (
    <ImportWizardDialog<CustomerImportCommitResponse>
      open={open}
      onOpenChange={onOpenChange}
      onCommitted={onCommitted}
      title="Nhập khẩu khách hàng"
      introTitle="Nhập khẩu khách hàng đáp ứng nhu cầu:"
      introBullets={INTRO_BULLETS}
      duplicateNoun="khách hàng"
      api={{
        validate: validateCustomersImportFile,
        commit: commitCustomersImportJob,
        cancelJob: cancelCustomersImportJob,
        downloadErrorRows: downloadCustomersImportErrorRowsExcel,
        downloadTemplate: downloadCustomersTemplate,
      }}
      reviewColumns={reviewColumns}
      renderComplete={(result) => (
        <ImportWizardComplete
          stats={[
            { value: result.customersCreated, label: "khách hàng mới" },
            {
              value: result.customersUpdated,
              label: "khách hàng được cập nhật",
            },
          ]}
        />
      )}
    />
  );
}
