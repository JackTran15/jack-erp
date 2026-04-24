import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationModule } from '../organization/organization.module';
import { BranchEntity } from './branch.entity';
import { UserBranchAssignmentEntity } from './user-branch-assignment.entity';
import { BranchService } from './branch.service';
import { BranchController } from './branch.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BranchEntity, UserBranchAssignmentEntity]),
    forwardRef(() => OrganizationModule),
  ],
  controllers: [BranchController],
  providers: [BranchService],
  exports: [BranchService],
})
export class BranchModule {}
