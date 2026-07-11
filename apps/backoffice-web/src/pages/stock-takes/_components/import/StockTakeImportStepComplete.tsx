import { ImportSuccessIllustration } from "../../../../components/shared/import-wizard/ImportSuccessIllustration";

interface Props {
  importedRows: number;
}

export function StockTakeImportStepComplete({ importedRows }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-10">
      <ImportSuccessIllustration />
      <p className="text-base text-muted-foreground">Nhập khẩu thành công</p>
      <p className="text-center text-base">
        <strong className="text-xl font-semibold text-[#2563eb]">
          {importedRows.toLocaleString("vi-VN")}
        </strong>{" "}
        dòng kiểm kê đã nhập
      </p>
    </div>
  );
}
