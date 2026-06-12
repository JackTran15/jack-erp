import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTypeEntity } from './report-type.entity';
import { REPORT_TYPE_SEEDS } from './report-types.seed';

/**
 * Upserts the report-type catalogue (REPORT_TYPE_SEEDS) into report_types on
 * boot, mirroring PermissionSyncService. Keeps the DB picker in sync with the
 * code registry without a manual seed step (prod + e2e populate automatically).
 */
@Injectable()
export class ReportTypeSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportTypeSyncService.name);

  constructor(
    @InjectRepository(ReportTypeEntity)
    private readonly repo: Repository<ReportTypeEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const existing = await this.repo.find();
    const byKey = new Map(existing.map((r) => [r.key, r]));

    let inserted = 0;
    let updated = 0;

    for (const seed of REPORT_TYPE_SEEDS) {
      const row = byKey.get(seed.key);
      if (!row) {
        await this.repo.save(
          this.repo.create({
            key: seed.key,
            name: seed.name,
            sortOrder: seed.sortOrder,
            isActive: true,
          }),
        );
        inserted += 1;
        continue;
      }

      if (row.name !== seed.name || row.sortOrder !== seed.sortOrder) {
        row.name = seed.name;
        row.sortOrder = seed.sortOrder;
        await this.repo.save(row);
        updated += 1;
      }
    }

    if (inserted > 0 || updated > 0) {
      this.logger.log(
        `Report-type catalogue sync: ${inserted} inserted, ${updated} updated`,
      );
    }
  }
}
