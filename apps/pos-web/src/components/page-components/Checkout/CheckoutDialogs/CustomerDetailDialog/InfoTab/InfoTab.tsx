import { CustomerInfoView } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerInfoView/CustomerInfoView";
import type { CustomerDetailData } from "@erp/pos/lib/page-libs/checkout/customerDetail.types";

export interface InfoTabProps {
  data: CustomerDetailData;
}

/**
 * "Thông tin" tab — read-only preview of the customer record using the same
 * grouped layout as `CustomerCreateDialog`. The "Sửa" CTA lives on the
 * dialog footer and is owned by `CustomerDetailDialog`.
 */
export function InfoTab({ data }: InfoTabProps) {
  return <CustomerInfoView data={data} />;
}
