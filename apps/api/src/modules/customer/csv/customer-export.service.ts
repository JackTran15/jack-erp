import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, Repository } from "typeorm";
import {
  CustomerImportExcelField,
  CustomerStatus,
  INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE,
} from "@erp/shared-interfaces";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { EmployeeProfileEntity } from "../../rbac/employee/employee-profile.entity";
import { CustomerGroupEntity } from "../customer-group.entity";
import { CustomerEntity } from "../customer.entity";
import { MembershipCardEntity } from "../membership-card.entity";
import {
  GENDER_EXPORT_LABELS,
  TIER_EXPORT_LABELS,
} from "./customer-excel-labels";
import {
  CustomerImportWorkbookService,
  CustomerWorkbookRow,
} from "./customer-import-workbook.service";

function formatExportDate(value?: Date | string | null): string {
  if (!value) return "";
  const iso =
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

function chunked<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

@Injectable()
export class CustomerExportService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(CustomerGroupEntity)
    private readonly groupRepo: Repository<CustomerGroupEntity>,
    @InjectRepository(MembershipCardEntity)
    private readonly cardRepo: Repository<MembershipCardEntity>,
    @InjectRepository(EmployeeProfileEntity)
    private readonly employeeProfileRepo: Repository<EmployeeProfileEntity>,
    private readonly workbookService: CustomerImportWorkbookService,
  ) {}

  /** MISA-layout xlsx of all customers, or only `customerIds` when provided. MERGED customers are never exported. */
  async exportCustomersExcelBuffer(
    actor: ActorContext,
    customerIds?: string[],
  ): Promise<Buffer> {
    const customers = await this.customerRepo.find({
      where: {
        organizationId: actor.organizationId,
        status: Not(CustomerStatus.MERGED),
        ...(customerIds?.length ? { id: In(customerIds) } : {}),
      },
      order: { code: "ASC" },
    });
    if (customerIds?.length && customers.length === 0) {
      throw new BadRequestException("Không tìm thấy khách hàng để xuất khẩu.");
    }

    const groups = await this.groupRepo.find({
      where: { organizationId: actor.organizationId },
    });
    const groupCodeById = new Map(
      groups.map((g) => [g.id, g.code ?? g.name]),
    );

    // Export-all fetches by org (1 bind param); the selected path chunks ids —
    // an unbounded In() breaks the Postgres bind-parameter limit on large orgs.
    const cardByCustomerId = new Map<string, MembershipCardEntity>();
    if (customerIds?.length) {
      for (const chunk of chunked(
        customers.map((c) => c.id),
        INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE,
      )) {
        const cards = await this.cardRepo.find({
          where: { organizationId: actor.organizationId, customerId: In(chunk) },
        });
        for (const card of cards) cardByCustomerId.set(card.customerId, card);
      }
    } else {
      const cards = await this.cardRepo.find({
        where: { organizationId: actor.organizationId },
      });
      for (const card of cards) cardByCustomerId.set(card.customerId, card);
    }

    const staffIds = [
      ...new Set(
        customers.map((c) => c.assignedStaffId).filter(Boolean) as string[],
      ),
    ];
    const profileByUserId = new Map<string, EmployeeProfileEntity>();
    for (const chunk of chunked(staffIds, INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE)) {
      const profiles = await this.employeeProfileRepo.find({
        where: { organizationId: actor.organizationId, userId: In(chunk) },
        relations: { user: true },
      });
      for (const profile of profiles) {
        profileByUserId.set(profile.userId, profile);
      }
    }

    const rows: CustomerWorkbookRow[] = customers.map((customer) => {
      const card = cardByCustomerId.get(customer.id);
      const profile = customer.assignedStaffId
        ? profileByUserId.get(customer.assignedStaffId)
        : undefined;
      const employeeName = profile?.user
        ? [profile.user.lastName, profile.user.firstName]
            .filter(Boolean)
            .join(" ")
            .trim()
        : "";

      return {
        [CustomerImportExcelField.CUSTOMER_CODE]: customer.code,
        [CustomerImportExcelField.CUSTOMER_NAME]: customer.name,
        [CustomerImportExcelField.CUSTOMER_CATEGORY_CODE]: customer.groupId
          ? (groupCodeById.get(customer.groupId) ?? "")
          : "",
        [CustomerImportExcelField.TEL]: customer.phone ?? "",
        [CustomerImportExcelField.BIRTHDAY]: formatExportDate(
          customer.birthDate,
        ),
        [CustomerImportExcelField.GENDER]: customer.gender
          ? GENDER_EXPORT_LABELS[customer.gender]
          : "",
        [CustomerImportExcelField.MEMBER_CARD_NO]: card?.cardNumber ?? "",
        [CustomerImportExcelField.MEMBER_LEVEL_CODE]: card
          ? TIER_EXPORT_LABELS[card.tier]
          : "",
        [CustomerImportExcelField.IDENTIFY_NUMBER]: customer.nationalId ?? "",
        [CustomerImportExcelField.ADDRESS]: customer.address ?? "",
        [CustomerImportExcelField.EMAIL]: customer.email ?? "",
        [CustomerImportExcelField.COMPANY_NAME]: customer.companyName ?? "",
        [CustomerImportExcelField.COMPANY_TAX_CODE]: customer.taxCode ?? "",
        [CustomerImportExcelField.DESCRIPTION]: customer.note ?? "",
        [CustomerImportExcelField.EMPLOYEE_CODE]: profile?.code ?? "",
        [CustomerImportExcelField.EMPLOYEE_NAME]: employeeName,
        // DEFER columns (MaximumDebtAmount, DueDate, ExportProvince/District/
        // Village) have no entity field — exported blank.
      };
    });

    return this.workbookService.buildWorkbookBuffer(rows);
  }
}
