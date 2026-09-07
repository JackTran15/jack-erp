import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BranchModule } from '../branch/branch.module';
import { GoodsIssueModule } from '../inventory/goods-issue/goods-issue.module';
import { GoodsReceiptModule } from '../inventory/goods-receipt/goods-receipt.module';
import { GoodsIssueEntity } from '../inventory/goods-issue/goods-issue.entity';
import { ItemEntity } from '../inventory/location/item.entity';
import { GoodsReceiptEntity } from '../inventory/goods-receipt/goods-receipt.entity';
import { ProviderEntity } from '../inventory/location/provider.entity';
import { MobileAuthController } from './controllers/mobile-auth.controller';
import { MobileBranchController } from './controllers/mobile-branch.controller';
import { MobileCounterpartyController } from './controllers/mobile-counterparty.controller';
import { MobileItemController } from './controllers/mobile-item.controller';
import { MobileProductController } from './controllers/mobile-product.controller';
import { MobileStockDocumentController } from './controllers/mobile-stock-document.controller';
import { MobileSupplierController } from './controllers/mobile-supplier.controller';
import { MobileUserController } from './controllers/mobile-user.controller';
import { MobileBranchService } from './services/mobile-branch.service';
import { MobileCounterpartyService } from './services/mobile-counterparty.service';
import { MobileItemService } from './services/mobile-item.service';
import { MobileProductService } from './services/mobile-product.service';
import { MobileStockDocumentService } from './services/mobile-stock-document.service';
import { MobileStockDocumentWriteService } from './services/mobile-stock-document-write.service';
import { MobileSupplierService } from './services/mobile-supplier.service';

/**
 * Bề mặt API DUY NHẤT mà app mobile gọi (`/mobile/**`) — mục đích là để `/docs`
 * gom trọn danh sách endpoint mobile vào một nhóm, và để sửa một route phẳng
 * thì biết ngay mobile có dùng hay không.
 *
 * Ưu tiên ủy quyền thẳng cho service sẵn có (`AuthService`, `UsersService`).
 * Chỉ tự đọc dữ liệu khi không đường nào có sẵn trả đúng hình dạng app cần —
 * hiện có hai ca, `MobileSupplierService` và `MobileProductService`; lý do ghi
 * trong từng file, và cả hai vấp cùng một thứ: đường có sẵn không sắp xếp được
 * theo tiêu chí app cần, lại trả kèm dữ liệu app không nên thấy.
 *
 * `AuthModule` phải import tường minh (nó export `AuthService`). `UsersService`
 * thì KHÔNG cần: `RbacModule` là `@Global`.
 *
 * CẤM thêm `@Version()` ở module này — versioning URI đang bật với
 * `defaultVersion: VERSION_NEUTRAL`, thêm vào là ra `/v1/mobile/...` và phá mọi
 * đường dẫn khai trong `ApiEndpoints` phía Dart.
 */
@Module({
  imports: [
    AuthModule,
    // `BranchService` — nguồn DUY NHẤT của "cửa hàng người dùng được phép".
    BranchModule,
    CqrsModule,
    // Hai service GHI của chứng từ kho — nơi mọi ràng buộc nghiệp vụ đã nằm
    // sẵn. Import để uỷ quyền, không để viết lại.
    GoodsReceiptModule,
    GoodsIssueModule,
    TypeOrmModule.forFeature([
      ProviderEntity,
      GoodsReceiptEntity,
      GoodsIssueEntity,
      ItemEntity,
    ]),
  ],
  controllers: [
    MobileAuthController,
    MobileBranchController,
    MobileUserController,
    MobileSupplierController,
    MobileCounterpartyController,
    MobileItemController,
    MobileProductController,
    MobileStockDocumentController,
  ],
  providers: [
    MobileBranchService,
    MobileSupplierService,
    MobileCounterpartyService,
    MobileItemService,
    MobileProductService,
    MobileStockDocumentService,
    MobileStockDocumentWriteService,
  ],
})
export class MobileModule {}
