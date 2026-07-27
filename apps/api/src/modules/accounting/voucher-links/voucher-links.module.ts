import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoucherLinkEntity } from './voucher-link.entity';
import { VoucherLinksService } from './voucher-links.service';

@Module({
  imports: [TypeOrmModule.forFeature([VoucherLinkEntity])],
  providers: [VoucherLinksService],
  exports: [VoucherLinksService],
})
export class VoucherLinksModule {}
