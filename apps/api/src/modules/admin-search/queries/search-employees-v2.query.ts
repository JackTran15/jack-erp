import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { EmployeeSearchV2Dto } from '../dto/employee-search-v2.dto';

export class SearchEmployeesV2Query {
  constructor(
    public readonly dto: EmployeeSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
