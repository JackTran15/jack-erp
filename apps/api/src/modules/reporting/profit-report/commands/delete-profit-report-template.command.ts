import { TemplateScope } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class DeleteProfitReportTemplateCommand {
  constructor(
    public readonly id: string,
    public readonly actor: ActorContext,
    public readonly scope?: TemplateScope,
  ) {}
}
