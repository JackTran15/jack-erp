import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Permission,
  PermissionGroup,
  PermissionsCatalogue,
} from '@erp/shared-interfaces';
import { PermissionEntity } from '../auth/permission.entity';
import { RequirePermission } from '../auth/decorators';
import { PermissionGuard } from './permission.guard';

@Controller('admin/permissions')
@UseGuards(PermissionGuard)
export class PermissionsController {
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
  ) {}

  /** Returns the catalogue of permission keys, both as a flat list and grouped by module. */
  @Get()
  @RequirePermission('iam.permission.read')
  async list(): Promise<PermissionsCatalogue> {
    const rows = await this.permissionRepo.find({
      order: { module: 'ASC', key: 'ASC' },
    });
    const flat: Permission[] = rows.map((p) => ({
      key: p.key,
      description: p.description,
      module: p.module,
    }));

    const groupsMap = new Map<string, Permission[]>();
    for (const p of flat) {
      const list = groupsMap.get(p.module) ?? [];
      list.push(p);
      groupsMap.set(p.module, list);
    }
    const grouped: PermissionGroup[] = Array.from(groupsMap.entries())
      .map(([module, permissions]) => ({ module, permissions }))
      .sort((a, b) => a.module.localeCompare(b.module));

    return { permissions: flat, grouped };
  }
}
