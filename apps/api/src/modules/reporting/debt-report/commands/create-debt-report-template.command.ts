import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CreateDebtReportTemplateDto } from '../dto/create-debt-report-template.dto';

export class CreateDebtReportTemplateCommand {
  constructor(
    public readonly dto: CreateDebtReportTemplateDto,
    public readonly actor: ActorContext,
  ) {}
}
