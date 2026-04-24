import { Injectable, Logger } from '@nestjs/common';
import { CrudEntityConfig } from '@erp/shared-interfaces';

export interface EntityRegistration {
  config: CrudEntityConfig;
  serviceToken: string;
}

@Injectable()
export class EntityRegistryService {
  private readonly logger = new Logger(EntityRegistryService.name);
  private readonly registry = new Map<string, EntityRegistration>();

  registerEntity(config: CrudEntityConfig, serviceToken: string): void {
    if (this.registry.has(config.entityKey)) {
      this.logger.warn(
        `Entity "${config.entityKey}" is already registered — overwriting`,
      );
    }
    this.registry.set(config.entityKey, { config, serviceToken });
    this.logger.log(
      `Registered entity "${config.entityKey}" (${config.displayName})`,
    );
  }

  getEntityConfig(entityKey: string): CrudEntityConfig | null {
    return this.registry.get(entityKey)?.config ?? null;
  }

  getRegistration(entityKey: string): EntityRegistration | null {
    return this.registry.get(entityKey) ?? null;
  }

  getAllEntities(): CrudEntityConfig[] {
    return Array.from(this.registry.values()).map((r) => r.config);
  }
}
