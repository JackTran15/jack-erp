import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DocumentNumberingModule } from "../../document-numbering/document-numbering.module";
import { InventoryImportJobRowEntity } from "../../inventory/csv/inventory-import-job-row.entity";
import { InventoryImportJobEntity } from "../../inventory/csv/inventory-import-job.entity";
import { EmployeeProfileEntity } from "../../rbac/employee/employee-profile.entity";
import { WebSocketModule } from "../../websocket/websocket.module";
import { CustomerGroupEntity } from "../customer-group.entity";
import { CustomerEntity } from "../customer.entity";
import { MembershipCardEntity } from "../membership-card.entity";
import { CustomerExportController } from "./customer-export.controller";
import { CustomerExportService } from "./customer-export.service";
import { CustomerImportController } from "./customer-import.controller";
import { CustomerImportService } from "./customer-import.service";
import { CustomerImportWorkbookService } from "./customer-import-workbook.service";

/**
 * Excel import/export for the customer catalog (MISA `DanhMucKhachHang.xls`
 * template). Reuses the shared inventory import job/row entities for job
 * tracking; the import/export logic itself is customer-specific.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryImportJobEntity,
      InventoryImportJobRowEntity,
      CustomerEntity,
      CustomerGroupEntity,
      MembershipCardEntity,
      EmployeeProfileEntity,
    ]),
    DocumentNumberingModule,
    WebSocketModule,
  ],
  controllers: [CustomerImportController, CustomerExportController],
  providers: [
    CustomerImportService,
    CustomerExportService,
    CustomerImportWorkbookService,
  ],
})
export class CustomerCsvModule {}
