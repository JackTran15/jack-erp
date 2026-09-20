import { PaginationControls } from "../../../components/table/PaginationControls";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../store/page-stores/orders/orders.store";

interface Props {
  total: number;
  onRefresh: () => void;
}

export function OrdersPagePagination({ total, onRefresh }: Props) {
  const page = useOrdersStore((s) => s.page);
  const pageSize = useOrdersStore((s) => s.pageSize);
  const { setPage, setPageSize } = useOrdersActions();

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
