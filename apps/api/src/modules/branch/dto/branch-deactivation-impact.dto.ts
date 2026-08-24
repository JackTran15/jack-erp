import { ApiProperty } from "@nestjs/swagger";

/** One reason the branch cannot be deactivated at all. */
export class BranchDeactivationBlockerDto {
  @ApiProperty({ example: "MAIN_BRANCH" })
  code!: string;

  @ApiProperty({ example: "Không thể ngừng hoạt động cửa hàng chính của tổ chức." })
  message!: string;
}

/** One thing still outstanding at the branch. Advisory only — never blocks. */
export class BranchDeactivationWarningDto {
  @ApiProperty({ example: "stock_balances" })
  code!: string;

  @ApiProperty({ example: "dòng tồn kho" })
  label!: string;

  @ApiProperty({ example: 412 })
  count!: number;
}

export class BranchDeactivationImpactDto {
  @ApiProperty()
  branchId!: string;

  @ApiProperty()
  branchName!: string;

  @ApiProperty()
  isMainBranch!: boolean;

  @ApiProperty({ type: [BranchDeactivationBlockerDto] })
  blockers!: BranchDeactivationBlockerDto[];

  @ApiProperty({ type: [BranchDeactivationWarningDto] })
  warnings!: BranchDeactivationWarningDto[];
}
