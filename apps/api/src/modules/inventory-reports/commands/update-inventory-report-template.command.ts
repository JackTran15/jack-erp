import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { UpdateInventoryReportTemplateDto } from '../dto/update-inventory-report-template.dto';

export class UpdateInventoryReportTemplateCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateInventoryReportTemplateDto,
    public readonly actor: ActorContext,
  ) {}
}
