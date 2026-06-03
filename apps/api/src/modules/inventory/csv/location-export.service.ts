import { LOCATION_TYPE_LABEL } from "@erp/shared-interfaces";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { LocationEntity } from "../location/location.entity";
import {
  LocationImportRow,
  LocationImportWorkbookService,
} from "./location-import-workbook.service";

@Injectable()
export class LocationExportService {
  constructor(
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    private readonly workbookService: LocationImportWorkbookService,
  ) {}

  async exportLocationsExcelBuffer(actor: ActorContext): Promise<Buffer> {
    const qb = this.locationRepo
      .createQueryBuilder("l")
      .leftJoinAndSelect("l.storage", "storage")
      .where("l.organizationId = :orgId", { orgId: actor.organizationId });

    if (actor.branchId) {
      qb.andWhere("l.branchId = :branchId", { branchId: actor.branchId });
    }

    const locations = await qb.orderBy("l.createdAt", "DESC").getMany();

    const rows: LocationImportRow[] = locations.map((loc) => ({
      code: loc.code,
      name: loc.name,
      storageName: loc.storage?.name ?? "",
      typeLabel: LOCATION_TYPE_LABEL[loc.type] ?? loc.type,
    }));

    return this.workbookService.buildWorkbookBuffer(rows);
  }

  async exportTemplateBuffer(): Promise<Buffer> {
    return this.workbookService.buildWorkbookBuffer([]);
  }
}
