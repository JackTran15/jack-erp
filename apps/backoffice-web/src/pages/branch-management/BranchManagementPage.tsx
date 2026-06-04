import { CrudListPage } from "../../components/crud/CrudListPage";
import { useAuth } from "../../hooks/useAuth";
import { useInvalidateBranches } from "../../hooks/iam/useBranches";

export function BranchManagementPage() {
  const { refresh } = useAuth();
  const invalidateBranches = useInvalidateBranches();

  const handleRecordSaved = () => {
    void refresh();
    invalidateBranches();
  };

  return (
    <CrudListPage
      entityKey="branches"
      disableRowClick={true}
      onRecordSaved={handleRecordSaved}
    />
  );
}
