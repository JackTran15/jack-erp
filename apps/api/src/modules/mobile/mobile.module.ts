import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { EmployeeProfileEntity } from '../rbac/employee/employee-profile.entity';
import { PosModule } from '../pos/pos.module';
import { InvoiceReportModule } from '../reporting/invoice-report/invoice-report.module';
import { PromotionModule } from '../promotion/promotion.module';
import { BranchModule } from '../branch/branch.module';
import { CustomerModule } from '../customer/customer.module';
import { GoodsIssueModule } from '../inventory/goods-issue/goods-issue.module';
import { GoodsReceiptModule } from '../inventory/goods-receipt/goods-receipt.module';
import { GoodsIssueEntity } from '../inventory/goods-issue/goods-issue.entity';
import { ItemEntity } from '../inventory/location/item.entity';
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
import { MobileProductAttributeController } from './controllers/mobile-product-attribute.controller';
import { MobileItemCategoryController } from './controllers/mobile-item-category.controller';
import { MobileInvoiceController } from './controllers/mobile-invoice.controller';
import { MobileItemController } from './controllers/mobile-item.controller';
import { MobileManagerInvoiceController } from './controllers/mobile-manager-invoice.controller';
import { MobileProductController } from './controllers/mobile-product.controller';
import { MobileProductRevenueController } from './controllers/mobile-product-revenue.controller';
import { MobilePromotionController } from './controllers/mobile-promotion.controller';
import { MobileSalesItemController } from './controllers/mobile-sales-item.controller';
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
import { MobileProductAttributeService } from './services/mobile-product-attribute.service';
import { MobileInvoiceService } from './services/mobile-invoice.service';
import { MobileItemService } from './services/mobile-item.service';
import { MobileManagerInvoiceService } from './services/mobile-manager-invoice.service';
import { MobileProductRevenueService } from './services/mobile-product-revenue.service';
import { MobileProductService } from './services/mobile-product.service';
import { MobileSalesItemService } from './services/mobile-sales-item.service';
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
 * `MobileCustomerService`, `MobileManagerInvoiceService`, `MobileInventoryService`,
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
 * HAI bề mặt hoá đơn cùng sống ở đây, và đó là chủ ý chứ không phải trùng
 * lặp: `GET /mobile/invoices` (`MobileInvoiceService`) là hoá đơn CỦA NGƯỜI
 * ĐANG ĐĂNG NHẬP cho app tư vấn bán hàng — phạm vi ép ở server (ADR-24);
 * `GET /mobile/manager/invoices` (`MobileManagerInvoiceService`) là lịch sử
 * bán TOÀN TỔ CHỨC cho app quản lý, lọc cửa hàng/trạng thái là tuỳ chọn.
 * Gộp hai đường là buộc một app mang bộ lọc mà app kia cấm.
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
    // `PosModule` phục vụ BA thứ: `InvoiceService.findOneWithItems` (chi tiết
    // hoá đơn của cả hai app uỷ quyền cho nó), `EvaluateCartHandler` cùng các
    // port của nó (`PROMOTION_REPOSITORY`, `CATALOG_READER`, `CUSTOMER_READER`)
    // và `SearchInvoicesV2Handler`. `CqrsModule` một mình KHÔNG đủ: `QueryBus`
    // chỉ tìm được handler đã đăng ký, nên thiếu dòng import này là 500
    // "No handler found" lúc CHẠY, không phải lỗi lúc biên dịch.
    PosModule,
    // `SearchInvoiceReportHandler` sống trong module này — `CqrsModule` một
    // mình không đủ để `QueryBus` tìm ra nó.
    InvoiceReportModule,
    PromotionModule,
    // Hai service GHI của chứng từ kho — nơi mọi ràng buộc nghiệp vụ đã nằm
    // sẵn. Import để uỷ quyền, không để viết lại.
    GoodsReceiptModule,
    GoodsIssueModule,
    TypeOrmModule.forFeature([
      ProviderEntity,
      GoodsReceiptEntity,
      GoodsIssueEntity,
      ItemEntity,
      // Tra `employee_profiles.id` từ `users.id` — khoá mà `invoices.salesperson_id`
      // thật sự trỏ tới (ADR-24). `RbacModule` là `@Global` nhưng nó export
      // service chứ không export repository, nên khai riêng ở đây.
      EmployeeProfileEntity,
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
    MobileManagerInvoiceController,
    MobileInventoryController,
    MobileRevenueReportController,
    MobileOverviewReportController,
    MobileRevenueEstimateController,
    MobileStoreDetailController,
    MobileDebtReportController,
    MobileCashflowReportController,
    MobileProductAttributeController,
    MobileInvoiceController,
    MobileItemCategoryController,
    MobileItemController,
    MobileProductController,
    MobileProductRevenueController,
    MobilePromotionController,
    MobileSalesItemController,
    MobileStockDocumentController,
  ],
  providers: [
    MobileBranchService,
    MobileBusinessReportService,
    MobileSupplierService,
    MobileCounterpartyService,
    MobileCustomerService,
    MobileManagerInvoiceService,
    MobileInventoryService,
    MobileInventoryDrilldownService,
    MobileInventoryCatalogService,
    MobileRevenueReportService,
    MobileOverviewReportService,
    MobileRevenueEstimateService,
    MobileStoreDetailService,
    MobileDebtReportService,
    MobileCashflowReportService,
    MobileProductAttributeService,
    MobileInvoiceService,
    MobileItemService,
    MobileProductRevenueService,
    MobileProductService,
    MobileSalesItemService,
    MobileStockDocumentService,
    MobileStockDocumentWriteService,
  ],
})
export class MobileModule {}
