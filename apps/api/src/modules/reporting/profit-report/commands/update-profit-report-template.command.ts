import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { UpdateProfitReportTemplateDto } from '../dto/update-profit-report-template.dto';

export class UpdateProfitReportTemplateCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateProfitReportTemplateDto,
    public readonly actor: ActorContext,
  ) {}
}
