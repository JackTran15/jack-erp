import { Injectable } from '@nestjs/common';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../branch/branch.entity';
import { BranchService } from '../../branch/branch.service';
import { MobileBranchResponseDto } from '../dto/mobile-branch.response.dto';

/**
 * Cửa hàng cho app mobile.
 *
 * Uỷ quyền cho `BranchService.listMyBranches` — nó trả giao của bảng phân công
 * `user_branch_assignments` với những chi nhánh còn `ACTIVE`, tức ĐÚNG tập mà
 * `BranchScopeGuard` sẽ chấp nhận về sau.
 *
 * Đây là chỗ dễ chọn nhầm nguồn nhất: `BranchService.list` trả mọi chi nhánh
 * của TỔ CHỨC. Dùng nó thì màn bộ lọc bày ra những cửa hàng mà mọi request kế
 * tiếp sẽ trả 403 — người dùng chọn được một thứ không dùng được, và câu lỗi
 * thì nói về quyền chứ không nói về chỗ họ vừa chạm.
 */
@Injectable()
export class MobileBranchService {
  constructor(private readonly branches: BranchService) {}

  async listMine(actor: ActorContext): Promise<MobileBranchResponseDto[]> {
    const rows = await this.branches.listMyBranches(actor);

    return rows.map(toMobileBranch);
  }
}

/**
 * Chép TƯỜNG MINH bốn trường — cùng lý do đã ghi ở các mapper khác của module
 * này: đây là thứ duy nhất chặn các trường mới thêm vào entity tự động rò ra
 * ngoài, và nó phải giữ được tính chất đó mà không cần ai nhớ.
 */
function toMobileBranch(row: BranchEntity): MobileBranchResponseDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? null,
    isMain: row.isMainBranch,
  };
}
