import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CreateInvoiceReportTemplateDto } from '../dto/create-invoice-report-template.dto';

export class CreateInvoiceReportTemplateCommand {
  constructor(
    public readonly dto: CreateInvoiceReportTemplateDto,
    public readonly actor: ActorContext,
  ) {}
}
