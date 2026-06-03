import { PartialType } from '@nestjs/swagger';
import { CreateMembershipCardTypeDto } from './create-membership-card-type.dto';

export class UpdateMembershipCardTypeDto extends PartialType(CreateMembershipCardTypeDto) {}
