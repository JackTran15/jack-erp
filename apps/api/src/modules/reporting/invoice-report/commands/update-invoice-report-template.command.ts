import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { UpdateInvoiceReportTemplateDto } from '../dto/update-invoice-report-template.dto';

export class UpdateInvoiceReportTemplateCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateInvoiceReportTemplateDto,
    public readonly actor: ActorContext,
  ) {}
}
