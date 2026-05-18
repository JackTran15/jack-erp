import { PartialType } from '@nestjs/swagger';
import { CreateIssueReasonDto } from './create-issue-reason.dto';

export class UpdateIssueReasonDto extends PartialType(CreateIssueReasonDto) {}
