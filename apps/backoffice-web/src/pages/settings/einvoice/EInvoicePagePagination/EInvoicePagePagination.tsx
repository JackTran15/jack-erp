import { PaginationControls } from "../../../../components/table/PaginationControls";
import {
  useEInvoiceActions,
  useEInvoiceStore,
} from "../../../../store/page-stores/einvoice/einvoice.store";

interface Props {
  total: number;
  onRefresh: () => void;
}

export function EInvoicePagePagination({ total, onRefresh }: Props) {
  const page = useEInvoiceStore((s) => s.page);
  const pageSize = useEInvoiceStore((s) => s.pageSize);
  const { setPage, setPageSize } = useEInvoiceActions();

  return (
    <PaginationControls
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      onRefresh={onRefresh}
    />
  );
}
