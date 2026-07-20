import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { UpdateDebtReportTemplateDto } from '../dto/update-debt-report-template.dto';

export class UpdateDebtReportTemplateCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateDebtReportTemplateDto,
    public readonly actor: ActorContext,
  ) {}
}
