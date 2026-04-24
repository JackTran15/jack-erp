import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationModule } from '../organization/organization.module';
import { BranchModule } from '../branch/branch.module';
import { RegistrationRequestEntity } from './registration-request.entity';
import { RegistrationService } from './registration.service';
import { RegistrationController } from './registration.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([RegistrationRequestEntity]),
    OrganizationModule,
    BranchModule,
  ],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
