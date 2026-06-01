import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from '../branch/branch.entity';
import { UserEntity } from '../auth/user.entity';
import { EmployeeProfileEntity } from '../rbac/employee/employee-profile.entity';
import { SalesmanAssignmentEntity } from './salesman-assignment.entity';
import { SalesManagerAssignmentEntity } from './sales-manager-assignment.entity';
import { SalesHierarchyService } from './sales-hierarchy.service';
import { SalesHierarchyController } from './sales-hierarchy.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesmanAssignmentEntity,
      SalesManagerAssignmentEntity,
      BranchEntity,
      UserEntity,
      EmployeeProfileEntity,
    ]),
  ],
  controllers: [SalesHierarchyController],
  providers: [SalesHierarchyService],
  exports: [SalesHierarchyService],
})
export class SalesHierarchyModule {}
