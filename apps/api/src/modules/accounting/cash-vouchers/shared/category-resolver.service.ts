import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashVoucherCategoryEntity } from '../cash-voucher-categories/cash-voucher-category.entity';

/** Resolves a cash voucher category code → id within an organization. */
@Injectable()
export class CashVoucherCategoryResolverService {
  constructor(
    @InjectRepository(CashVoucherCategoryEntity)
    private readonly repo: Repository<CashVoucherCategoryEntity>,
  ) {}

  async resolveId(
    organizationId: string,
    code: string | undefined,
  ): Promise<string | undefined> {
    if (!code) return undefined;
    const row = await this.repo.findOne({
      where: { organizationId, code },
    });
    return row?.id;
  }
}
