import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../auth/decorators';
import { RequireBranchScope } from '../auth/decorators';
import { PermissionGuard } from '../rbac/permission.guard';
import { BranchScopeGuard } from '../rbac/branch-scope.guard';
import { AuditInterceptor } from '../crud/audit.interceptor';
import { DiscountCodeService } from './discount-code.service';
import { VoucherService } from './voucher.service';
import { PromotionService } from './promotion.service';
import { PromotionApplyService } from './promotion-apply.service';
import { CreateDiscountCodeDto } from './dto/create-discount-code.dto';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { ApplyPromotionDto } from './dto/apply-promotion.dto';

@Controller('promotions')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class PromotionController {
  constructor(
    private readonly discountCodeService: DiscountCodeService,
    private readonly voucherService: VoucherService,
    private readonly promotionService: PromotionService,
    private readonly promotionApplyService: PromotionApplyService,
  ) {}

  // ---------------------------------------------------------------------------
  // Discount codes
  // ---------------------------------------------------------------------------

  @Get('discount-codes')
  @RequirePermission('pos.promotion.read')
  listDiscountCodes(@Actor() actor: ActorContext) {
    return this.discountCodeService.findAll(actor);
  }

  @Post('discount-codes')
  @RequirePermission('pos.promotion.write')
  createDiscountCode(
    @Body() dto: CreateDiscountCodeDto,
    @Actor() actor: ActorContext,
  ) {
    return this.discountCodeService.create(dto, actor);
  }

  @Patch('discount-codes/:id')
  @RequirePermission('pos.promotion.write')
  updateDiscountCode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateDiscountCodeDto>,
    @Actor() actor: ActorContext,
  ) {
    return this.discountCodeService.update(id, dto, actor);
  }

  @Delete('discount-codes/:id')
  @RequirePermission('pos.promotion.write')
  deactivateDiscountCode(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.discountCodeService.deactivate(id, actor);
  }

  @Post('discount-codes/:code/validate')
  @RequirePermission('pos.promotion.read')
  validateDiscountCode(
    @Param('code') code: string,
    @Body('orderValue') orderValue: number,
    @Actor() actor: ActorContext,
  ) {
    return this.discountCodeService.validate(code, orderValue ?? 0, actor);
  }

  // ---------------------------------------------------------------------------
  // Vouchers
  // ---------------------------------------------------------------------------

  @Get('vouchers')
  @RequirePermission('pos.promotion.read')
  listVouchers(@Actor() actor: ActorContext) {
    return this.voucherService.findAll(actor);
  }

  @Post('vouchers')
  @RequirePermission('pos.promotion.write')
  createVoucher(
    @Body() dto: CreateVoucherDto,
    @Actor() actor: ActorContext,
  ) {
    return this.voucherService.create(dto, actor);
  }

  @Patch('vouchers/:id')
  @RequirePermission('pos.promotion.write')
  updateVoucher(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateVoucherDto>,
    @Actor() actor: ActorContext,
  ) {
    return this.voucherService.update(id, dto, actor);
  }

  @Delete('vouchers/:id')
  @RequirePermission('pos.promotion.write')
  deactivateVoucher(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.voucherService.deactivate(id, actor);
  }

  @Post('vouchers/:code/validate')
  @RequirePermission('pos.promotion.read')
  validateVoucher(
    @Param('code') code: string,
    @Body('customerId') customerId: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.voucherService.validate(code, customerId, actor);
  }

  // ---------------------------------------------------------------------------
  // Promotion programs
  // ---------------------------------------------------------------------------

  @Get('programs')
  @RequirePermission('pos.promotion.read')
  listPromotions(@Actor() actor: ActorContext) {
    return this.promotionService.findAll(actor, actor.branchId);
  }

  @Post('programs')
  @RequirePermission('pos.promotion.write')
  createPromotion(
    @Body() dto: CreatePromotionDto,
    @Actor() actor: ActorContext,
  ) {
    return this.promotionService.create(dto, actor);
  }

  @Patch('programs/:id')
  @RequirePermission('pos.promotion.write')
  updatePromotion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreatePromotionDto>,
    @Actor() actor: ActorContext,
  ) {
    return this.promotionService.update(id, dto, actor);
  }

  @Delete('programs/:id')
  @RequirePermission('pos.promotion.write')
  deactivatePromotion(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.promotionService.deactivate(id, actor);
  }

  // ---------------------------------------------------------------------------
  // Apply promotions to invoices
  // ---------------------------------------------------------------------------

  @Post('invoices/:invoiceId/apply')
  @RequirePermission('pos.promotion.write')
  applyPromotion(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: ApplyPromotionDto,
    @Actor() actor: ActorContext,
  ) {
    return this.promotionApplyService.apply(invoiceId, dto, actor);
  }

  @Delete('invoices/:invoiceId/:promotionId')
  @RequirePermission('pos.promotion.write')
  removePromotion(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.promotionApplyService.remove(invoiceId, promotionId, actor);
  }
}
