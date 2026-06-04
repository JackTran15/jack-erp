import { CrudListPage } from "../../components/crud/CrudListPage";

export function InventoryStoragesPage() {
  return <CrudListPage entityKey="inventory-storages" disableRowClick={true} />;
}
