import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BranchModule } from '../branch/branch.module';
import { CustomerModule } from '../customer/customer.module';
import { GoodsIssueModule } from '../inventory/goods-issue/goods-issue.module';
import { GoodsReceiptModule } from '../inventory/goods-receipt/goods-receipt.module';
import { GoodsIssueEntity } from '../inventory/goods-issue/goods-issue.entity';
import { ItemEntity } from '../inventory/location/item.entity';
import { PosModule } from '../pos/pos.module';
import { GoodsReceiptEntity } from '../inventory/goods-receipt/goods-receipt.entity';
import { ProviderEntity } from '../inventory/location/provider.entity';
import { MobileAuthController } from './controllers/mobile-auth.controller';
import { MobileBranchController } from './controllers/mobile-branch.controller';
import { MobileBusinessReportController } from './controllers/mobile-business-report.controller';
import { MobileCashflowReportController } from './controllers/mobile-cashflow-report.controller';
import { MobileCounterpartyController } from './controllers/mobile-counterparty.controller';
import { MobileCustomerController } from './controllers/mobile-customer.controller';
import { MobileDebtReportController } from './controllers/mobile-debt-report.controller';
import { MobileInventoryController } from './controllers/mobile-inventory.controller';
import { MobileOverviewReportController } from './controllers/mobile-overview-report.controller';
import { MobileRevenueEstimateController } from './controllers/mobile-revenue-estimate.controller';
import { MobileRevenueReportController } from './controllers/mobile-revenue-report.controller';
import { MobileStoreDetailController } from './controllers/mobile-store-detail.controller';
import { MobileInvoiceController } from './controllers/mobile-invoice.controller';
import { MobileItemController } from './controllers/mobile-item.controller';
import { MobileProductController } from './controllers/mobile-product.controller';
import { MobileStockDocumentController } from './controllers/mobile-stock-document.controller';
import { MobileSupplierController } from './controllers/mobile-supplier.controller';
import { MobileUserController } from './controllers/mobile-user.controller';
import { MobileBranchService } from './services/mobile-branch.service';
import { MobileBusinessReportService } from './services/mobile-business-report.service';
import { MobileCashflowReportService } from './services/mobile-cashflow-report.service';
import { MobileCounterpartyService } from './services/mobile-counterparty.service';
import { MobileCustomerService } from './services/mobile-customer.service';
import { MobileDebtReportService } from './services/mobile-debt-report.service';
import { MobileInventoryCatalogService } from './services/mobile-inventory-catalog.service';
import { MobileInventoryDrilldownService } from './services/mobile-inventory-drilldown.service';
import { MobileInventoryService } from './services/mobile-inventory.service';
import { MobileOverviewReportService } from './services/mobile-overview-report.service';
import { MobileRevenueEstimateService } from './services/mobile-revenue-estimate.service';
import { MobileRevenueReportService } from './services/mobile-revenue-report.service';
import { MobileStoreDetailService } from './services/mobile-store-detail.service';
import { MobileInvoiceService } from './services/mobile-invoice.service';
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
 * hiện có mười hai ca — `MobileSupplierService`, `MobileProductService`,
 * `MobileCustomerService`, `MobileInvoiceService`, `MobileInventoryService`,
 * `MobileBusinessReportService`, `MobileRevenueReportService`,
 * `MobileOverviewReportService`, `MobileStoreDetailService`,
 * `MobileDebtReportService`, `MobileCashflowReportService`,
 * `MobileRevenueEstimateService`; lý do ghi trong
 * từng file, và cả mười hai vấp cùng một thứ: đường có sẵn không sắp xếp được
 * theo tiêu chí app cần, lại trả kèm dữ liệu app không nên thấy.
 * Ca khách hàng còn thêm một lớp: doanh thu từng khách không có ở bất kỳ danh
 * sách nào của web. Ca tồn kho thêm một lớp nữa: `StockSummaryService` của web
 * cố định grain item × kho, không gộp được theo mẫu mã hay cửa hàng, và cũng
 * không được export khỏi `StockLedgerModule`. Ca báo cáo kinh doanh: sáu câu
 * truy vấn của `BusinessResultsReport` là private và gộp về một phạm vi, không
 * nhóm được theo chi nhánh × tháng. Ca doanh thu theo mặt hàng:
 * `RevenueByItemReport` là `POST` trả bảng cột động cho một grain mỗi lượt,
 * không có chuỗi thời gian theo giờ/thứ hay chi nhánh của một mặt hàng. Ca
 * Tổng quan: web không có màn tương đương (dashboard cũ đọc bảng chết). Ca
 * doanh thu ước tính: web chưa có báo cáo theo thời gian/nhân viên (còn
 * comment trong `report-type.constant.ts`), và không báo cáo nào gộp theo
 * trạng thái hay phương thức thanh toán. Ca
 * công nợ khách hàng: `CustomerDebtsReport` gộp bốn query trong bộ nhớ, sắp
 * cố định theo tên, không tìm theo mã/SĐT. Ca thu chi: `CashLedgerService`
 * nhận đúng một quỹ mỗi lượt và trả bảng dòng, không gộp theo cửa hàng hay
 * hạng mục. Đường GHI khách hàng và CHI TIẾT
 * hoá đơn thì ngược lại — uỷ quyền, vì nghiệp vụ (cấp mã, thẻ thành viên, gom
 * thanh toán) đã nằm sẵn ở service của web.
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
    // `CustomerService` — đường GHI khách hàng uỷ quyền cho nó (cấp mã, thẻ
    // thành viên, guard đã gộp). Đọc thì `MobileCustomerService` tự làm.
    CustomerModule,
    CqrsModule,
    // `InvoiceService.findOneWithItems` — chi tiết hoá đơn uỷ quyền cho nó.
    PosModule,
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
    MobileBusinessReportController,
    MobileUserController,
    MobileSupplierController,
    MobileCounterpartyController,
    MobileCustomerController,
    MobileInvoiceController,
    MobileInventoryController,
    MobileRevenueReportController,
    MobileOverviewReportController,
    MobileRevenueEstimateController,
    MobileStoreDetailController,
    MobileDebtReportController,
    MobileCashflowReportController,
    MobileItemController,
    MobileProductController,
    MobileStockDocumentController,
  ],
  providers: [
    MobileBranchService,
    MobileBusinessReportService,
    MobileSupplierService,
    MobileCounterpartyService,
    MobileCustomerService,
    MobileInvoiceService,
    MobileInventoryService,
    MobileInventoryDrilldownService,
    MobileInventoryCatalogService,
    MobileRevenueReportService,
    MobileOverviewReportService,
    MobileRevenueEstimateService,
    MobileStoreDetailService,
    MobileDebtReportService,
    MobileCashflowReportService,
    MobileItemService,
    MobileProductService,
    MobileStockDocumentService,
    MobileStockDocumentWriteService,
  ],
})
export class MobileModule {}
