import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistrationModule } from '../registration/registration.module';
import { CoaModule } from '../accounting/coa/coa.module';
import { CashVouchersModule } from '../accounting/cash-vouchers/cash-vouchers.module';
import { CustomerModule } from '../customer/customer.module';
import { OrganizationEntity } from './organization.entity';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationEntity]),
    forwardRef(() => RegistrationModule),
    CoaModule,
    CashVouchersModule,
    forwardRef(() => CustomerModule),
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
