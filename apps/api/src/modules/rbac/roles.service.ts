import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { RoleSummary, RoleDetail } from '@erp/shared-interfaces';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { RoleEntity } from '../auth/role.entity';
import { PermissionEntity } from '../auth/permission.entity';
import { RolePermissionEntity } from '../auth/role-permission.entity';
import { UserRoleEntity } from '../auth/user-role.entity';
import { RbacService } from './rbac.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepo: Repository<RolePermissionEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    private readonly rbacService: RbacService,
    private readonly dataSource: DataSource,
  ) {}

  async list(actor: ActorContext): Promise<RoleSummary[]> {
    const roles = await this.roleRepo.find({
      where: { organizationId: actor.organizationId },
      order: { createdAt: 'ASC' },
    });
    return roles.map((r) => this.toView(r));
  }

  async findById(id: string, actor: ActorContext): Promise<RoleDetail> {
    const role = await this.roleRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    const permissionKeys = await this.getPermissionKeys(role.id);
    return { ...this.toView(role), permissionKeys };
  }

  async create(
    dto: CreateRoleDto,
    actor: ActorContext,
  ): Promise<RoleDetail> {
    const trimmedName = dto.name.trim();
    const existing = await this.roleRepo.findOne({
      where: { organizationId: actor.organizationId, name: trimmedName },
    });
    if (existing) {
      throw new ConflictException(
        `Role "${trimmedName}" already exists in this organization`,
      );
    }

    const permissionIds = dto.permissionKeys?.length
      ? await this.resolvePermissionIds(dto.permissionKeys)
      : [];

    const created = await this.dataSource.transaction(async (manager) => {
      const role = manager.create(RoleEntity, {
        organizationId: actor.organizationId,
        name: trimmedName,
        description: dto.description?.trim() ?? null,
        isSystem: false,
      });
      const savedRole = await manager.save(RoleEntity, role);

      if (permissionIds.length) {
        const rows = permissionIds.map((permissionId) =>
          manager.create(RolePermissionEntity, {
            roleId: savedRole.id,
            permissionId,
          }),
        );
        await manager.save(RolePermissionEntity, rows);
      }

      return savedRole;
    });

    this.logger.log(
      `Created role ${created.id} "${trimmedName}" (org=${actor.organizationId})`,
    );

    return this.findById(created.id, actor);
  }

  async update(
    id: string,
    dto: UpdateRoleDto,
    actor: ActorContext,
  ): Promise<RoleDetail> {
    const role = await this.roleRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (role.isSystem && trimmedName !== role.name) {
        throw new BadRequestException('System roles cannot be renamed');
      }
      if (trimmedName !== role.name) {
        const clash = await this.roleRepo.findOne({
          where: { organizationId: actor.organizationId, name: trimmedName },
        });
        if (clash) {
          throw new ConflictException(
            `Role "${trimmedName}" already exists in this organization`,
          );
        }
      }
      role.name = trimmedName;
    }
    if (dto.description !== undefined) {
      if (role.isSystem) {
        throw new BadRequestException(
          'System roles cannot be updated',
        );
      }
      role.description = dto.description?.trim() ?? null;
    }

    await this.roleRepo.save(role);
    return this.findById(id, actor);
  }

  async delete(id: string, actor: ActorContext): Promise<void> {
    const role = await this.roleRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }

    const affectedUsers = await this.userRoleRepo.find({
      where: { roleId: id, organizationId: actor.organizationId },
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermissionEntity, { roleId: id });
      await manager.delete(UserRoleEntity, {
        roleId: id,
        organizationId: actor.organizationId,
      });
      await manager.delete(RoleEntity, { id });
    });

    await Promise.all(
      affectedUsers.map((ur) =>
        this.rbacService.invalidateUserPermissions(
          ur.userId,
          actor.organizationId,
        ),
      ),
    );

    this.logger.log(
      `Deleted role ${id} (org=${actor.organizationId}, affected users=${affectedUsers.length})`,
    );
  }

  async setPermissions(
    id: string,
    permissionKeys: string[],
    actor: ActorContext,
  ): Promise<RoleDetail> {
    const role = await this.roleRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    if (role.isSystem) {
      throw new BadRequestException(
        'System role permissions cannot be changed',
      );
    }

    const permissionIds = permissionKeys.length
      ? await this.resolvePermissionIds(permissionKeys)
      : [];

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermissionEntity, { roleId: id });
      if (permissionIds.length) {
        const rows = permissionIds.map((permissionId) =>
          manager.create(RolePermissionEntity, {
            roleId: id,
            permissionId,
          }),
        );
        await manager.save(RolePermissionEntity, rows);
      }
    });

    // All users carrying this role need fresh permissions on next request.
    await this.rbacService.invalidateOrgPermissions(actor.organizationId);

    return this.findById(id, actor);
  }

  private async resolvePermissionIds(keys: string[]): Promise<string[]> {
    const found = await this.permissionRepo.find({
      where: { key: In(keys) },
    });
    if (found.length !== keys.length) {
      const foundKeys = new Set(found.map((p) => p.key));
      const missing = keys.filter((k) => !foundKeys.has(k));
      throw new BadRequestException(
        `Unknown permission keys: ${missing.join(', ')}`,
      );
    }
    return found.map((p) => p.id);
  }

  private async getPermissionKeys(roleId: string): Promise<string[]> {
    const rps = await this.rolePermissionRepo.find({ where: { roleId } });
    if (!rps.length) return [];
    const permissions = await this.permissionRepo.find({
      where: { id: In(rps.map((rp) => rp.permissionId)) },
    });
    return permissions.map((p) => p.key);
  }

  private toView(r: RoleEntity): RoleSummary {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
