import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberRuleEntity } from './document-number-rule.entity';
import { DocumentNumberCounterEntity } from './document-number-counter.entity';
import { DocumentNumberingService } from './document-numbering.service';
import { DocumentNumberingController } from './document-numbering.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentNumberRuleEntity,
      DocumentNumberCounterEntity,
    ]),
  ],
  controllers: [DocumentNumberingController],
  providers: [DocumentNumberingService],
  exports: [DocumentNumberingService],
})
export class DocumentNumberingModule {}
