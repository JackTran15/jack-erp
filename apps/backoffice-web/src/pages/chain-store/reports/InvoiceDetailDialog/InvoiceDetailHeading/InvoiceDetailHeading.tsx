interface Props {
  type: string;
}

export function InvoiceDetailHeading({ type }: Props) {
  const label = type === "RETURN" ? "HÓA ĐƠN ĐỔI TRẢ" : "HÓA ĐƠN THANH TOÁN";
  return (
    <h2 className="text-center text-base font-bold uppercase tracking-wide text-foreground">
      {label}
    </h2>
  );
}
