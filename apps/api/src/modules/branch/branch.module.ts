import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationModule } from '../organization/organization.module';
import { RegistrationModule } from '../registration/registration.module';
import { CashModule } from '../accounting/cash/cash.module';
import { DocumentNumberingModule } from '../document-numbering/document-numbering.module';
import { RbacModule } from '../rbac/rbac.module';
import { EntityRegistryService } from '../crud/entity-registry.service';
import { BranchEntity } from './branch.entity';
import { UserBranchAssignmentEntity } from './user-branch-assignment.entity';
import { BranchService } from './branch.service';
import { BranchStatusService } from './branch-status.service';
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
    DocumentNumberingModule,
    // PermissionGuard for the controller, RbacService for the status gate in
    // BranchService. RbacModule does not import BranchModule, so no cycle.
    RbacModule,
  ],
  controllers: [BranchController],
  providers: [
    BranchService,
    BranchStatusService,
    BranchCrudService,
    { provide: BRANCH_SERVICE_TOKEN, useExisting: BranchCrudService },
  ],
  exports: [BranchService, BranchStatusService],
})
export class BranchModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(BRANCH_ENTITY_CONFIG, BRANCH_SERVICE_TOKEN);
  }
}
