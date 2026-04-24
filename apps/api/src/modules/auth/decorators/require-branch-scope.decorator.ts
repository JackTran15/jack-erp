import { SetMetadata } from '@nestjs/common';

export const REQUIRE_BRANCH_SCOPE_KEY = 'requireBranchScope';

export const RequireBranchScope = () =>
  SetMetadata(REQUIRE_BRANCH_SCOPE_KEY, true);
