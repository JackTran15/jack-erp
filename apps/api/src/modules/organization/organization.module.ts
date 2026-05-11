import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistrationModule } from '../registration/registration.module';
import { CoaModule } from '../accounting/coa/coa.module';
import { OrganizationEntity } from './organization.entity';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationEntity]),
    forwardRef(() => RegistrationModule),
    CoaModule,
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
