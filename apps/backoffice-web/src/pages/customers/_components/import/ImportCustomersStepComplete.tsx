import { ImportSuccessIllustration } from "../../../inventory/_components/import/ImportSuccessIllustration";

interface Props {
  createdCount: number;
  updatedCount: number;
}

export function ImportCustomersStepComplete({
  createdCount,
  updatedCount,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-10">
      <ImportSuccessIllustration />
      <p className="text-base text-muted-foreground">Nhập khẩu thành công</p>
      <div className="space-y-1 text-center text-base">
        <p>
          <strong className="text-xl font-semibold text-[#2563eb]">
            {createdCount}
          </strong>{" "}
          khách hàng mới
        </p>
        <p>
          <strong className="text-xl font-semibold text-[#2563eb]">
            {updatedCount}
          </strong>{" "}
          khách hàng được cập nhật
        </p>
      </div>
    </div>
  );
}
