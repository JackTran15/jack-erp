import { useEffect } from "react";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { MapPinIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { useMyBranchesQuery } from "@erp/pos/hooks/react-query/use-query-branch";
import { useNavigate } from "react-router-dom";
import type { BranchRow } from "@erp/pos/interfaces/branch.interface";

export function PosLocationIndicator() {
  const navigate = useNavigate();
  const branchId = usePosBranchStore((s) => s.branchId);
  const setBranch = usePosBranchStore((s) => s.setBranch);

  const { data: branches = [] } = useMyBranchesQuery();

  useEffect(() => {
    if (!branches.length) return;
    const match = branches.find((b) => b.id === branchId);
    if (match) {
      setBranch(match.id, match.name);
    } else {
      const first = branches[0];
      setBranch(first.id, first.name);
      navigate("/", { replace: true });
    }
  }, [branches, branchId, setBranch, navigate]);

  const current: BranchRow | null =
    branches.find((b) => b.id === branchId) ?? null;

  const handleChange = (branch: BranchRow) => {
    if (branch.id === branchId) return;
    setBranch(branch.id, branch.name);
    navigate("/", { replace: true });
  };

  return (
    <PosSelect<BranchRow>
      items={branches}
      value={current}
      onChange={handleChange}
      itemKey={(b) => b.id}
      renderItem={(b) => b.name}
      ariaLabel="Chi nhánh"
      placeholder="Chọn chi nhánh"
      emptyText="Không có chi nhánh"
      prefix={<MapPinIcon size={14} className="text-gray-500" />}
      className="min-w-[180px]"
    />
  );
}
