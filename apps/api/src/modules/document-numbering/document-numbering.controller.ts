import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { DocumentType, PaginationQuery } from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from './document-numbering.service';
import {
  CreateDocumentNumberRuleDto,
  UpdateDocumentNumberRuleDto,
  GenerateDocumentNumberDto,
} from './dto';

@Controller()
export class DocumentNumberingController {
  constructor(private readonly service: DocumentNumberingService) {}

  @Post('document-number-rules')
  createRule(
    @Body() dto: CreateDocumentNumberRuleDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createRule(dto, actor);
  }

  @Get('document-number-rules')
  listRules(
    @Query() query: PaginationQuery & { documentType?: DocumentType; branchId?: string },
    @Actor() actor: ActorContext,
  ) {
    return this.service.listRules(
      {
        page: Number(query.page) || 1,
        pageSize: Number(query.pageSize) || 20,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        documentType: query.documentType,
        branchId: query.branchId,
      },
      actor,
    );
  }

  @Patch('document-number-rules/:id')
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentNumberRuleDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateRule(id, dto, actor);
  }

  @Post('document-number-rules/:id/activate')
  activateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.activateRule(id, actor);
  }

  @Post('document-number-rules/:id/deactivate')
  deactivateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.deactivateRule(id, actor);
  }

  @Post('document-numbers/generate')
  generate(
    @Body() dto: GenerateDocumentNumberDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.generate(dto.documentType, dto.branchId, actor);
  }
}
