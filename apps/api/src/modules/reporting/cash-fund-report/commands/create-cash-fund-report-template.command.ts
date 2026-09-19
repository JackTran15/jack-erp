import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CreateCashFundReportTemplateDto } from '../dto/create-cash-fund-report-template.dto';

export class CreateCashFundReportTemplateCommand {
  constructor(
    public readonly dto: CreateCashFundReportTemplateDto,
    public readonly actor: ActorContext,
  ) {}
}
