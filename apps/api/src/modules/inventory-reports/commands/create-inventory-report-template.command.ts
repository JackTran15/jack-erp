import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CreateInventoryReportTemplateDto } from '../dto/create-inventory-report-template.dto';

export class CreateInventoryReportTemplateCommand {
  constructor(
    public readonly dto: CreateInventoryReportTemplateDto,
    public readonly actor: ActorContext,
  ) {}
}
