import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTypesResult } from '@erp/shared-interfaces';
import { ReportTypeEntity } from '../report-type.entity';
import { ListInvoiceReportTypesQuery } from './list-invoice-report-types.query';

@QueryHandler(ListInvoiceReportTypesQuery)
export class ListInvoiceReportTypesHandler
  implements IQueryHandler<ListInvoiceReportTypesQuery>
{
  constructor(
    @InjectRepository(ReportTypeEntity)
    private readonly repo: Repository<ReportTypeEntity>,
  ) {}

  async execute(): Promise<InvoiceReportTypesResult> {
    const rows = await this.repo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', key: 'ASC' },
    });
    return { types: rows.map((r) => ({ key: r.key, name: r.name })) };
  }
}
