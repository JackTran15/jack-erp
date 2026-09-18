import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { UpdateCashFundReportTemplateDto } from '../dto/update-cash-fund-report-template.dto';

export class UpdateCashFundReportTemplateCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateCashFundReportTemplateDto,
    public readonly actor: ActorContext,
  ) {}
}
