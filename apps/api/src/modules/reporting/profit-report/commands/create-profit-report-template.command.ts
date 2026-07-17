import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CreateProfitReportTemplateDto } from '../dto/create-profit-report-template.dto';

export class CreateProfitReportTemplateCommand {
  constructor(
    public readonly dto: CreateProfitReportTemplateDto,
    public readonly actor: ActorContext,
  ) {}
}
