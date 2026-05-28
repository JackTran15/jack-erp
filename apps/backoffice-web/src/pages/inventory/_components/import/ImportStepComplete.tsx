import { ImportSuccessIllustration } from "./ImportSuccessIllustration";

interface Props {
  productsCount: number;
  itemsCount: number;
}

export function ImportStepComplete({ productsCount, itemsCount }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-10">
      <ImportSuccessIllustration />
      <p className="text-base text-muted-foreground">Nhập khẩu thành công</p>
      <div className="space-y-1 text-center text-base">
        <p>
          <strong className="text-xl font-semibold text-[#2563eb]">
            {productsCount}
          </strong>{" "}
          mẫu mã
        </p>
        <p>
          <strong className="text-xl font-semibold text-[#2563eb]">
            {itemsCount}
          </strong>{" "}
          hàng hóa
        </p>
      </div>
    </div>
  );
}
