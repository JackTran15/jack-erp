import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationModule } from '../organization/organization.module';
import { RegistrationModule } from '../registration/registration.module';
import { CashModule } from '../accounting/cash/cash.module';
import { EntityRegistryService } from '../crud/entity-registry.service';
import { BranchEntity } from './branch.entity';
import { UserBranchAssignmentEntity } from './user-branch-assignment.entity';
import { BranchService } from './branch.service';
import { BranchController } from './branch.controller';
import {
  BranchCrudService,
  BRANCH_ENTITY_CONFIG,
  BRANCH_SERVICE_TOKEN,
} from './branch-crud.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BranchEntity, UserBranchAssignmentEntity]),
    forwardRef(() => OrganizationModule),
    forwardRef(() => RegistrationModule),
    CashModule,
  ],
  controllers: [BranchController],
  providers: [
    BranchService,
    BranchCrudService,
    { provide: BRANCH_SERVICE_TOKEN, useExisting: BranchCrudService },
  ],
  exports: [BranchService],
})
export class BranchModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(BRANCH_ENTITY_CONFIG, BRANCH_SERVICE_TOKEN);
  }
}
