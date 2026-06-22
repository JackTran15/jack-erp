import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerStatus } from '@erp/shared-interfaces';
import { ProviderEntity } from '../../inventory/location/provider.entity';
import { CustomerEntity } from '../../customer/customer.entity';
import { UserEntity } from '../../auth/user.entity';
import { EmployeeProfileEntity } from '../../rbac/employee/employee-profile.entity';
import {
  CounterpartyKind,
  CounterpartyOptionDto,
  SearchCounterpartiesResponseDto,
} from '../dto/search-counterparties.dto';
import { SearchCounterpartiesQuery } from './search-counterparties.query';

interface KindResult {
  items: CounterpartyOptionDto[];
  total: number;
}

@QueryHandler(SearchCounterpartiesQuery)
export class SearchCounterpartiesHandler
  implements IQueryHandler<SearchCounterpartiesQuery>
{
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providerRepo: Repository<ProviderEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchCounterpartiesQuery): Promise<SearchCounterpartiesResponseDto> {
    const { type, page, pageSize } = dto;
    const orgId = actor.organizationId;
    const like = dto.search?.trim() ? `%${dto.search.trim()}%` : null;

    if (type !== CounterpartyKind.ALL) {
      const offset = (page - 1) * pageSize;
      const { items, total } = await this.searchKind(
        type,
        orgId,
        like,
        pageSize,
        offset,
      );
      return { data: items, total, page, pageSize };
    }

    // type = all: take the top (page * pageSize) from each source so a k-way
    // merge + slice yields the correct globally-sorted page.
    const cap = page * pageSize;
    const [sup, cus, emp] = await Promise.all([
      this.searchSuppliers(orgId, like, cap, 0),
      this.searchCustomers(orgId, like, cap, 0),
      this.searchEmployees(orgId, like, cap, 0),
    ]);
    const merged = [...sup.items, ...cus.items, ...emp.items].sort((a, b) =>
      a.name.localeCompare(b.name, 'vi'),
    );
    return {
      data: merged.slice((page - 1) * pageSize, page * pageSize),
      total: sup.total + cus.total + emp.total,
      page,
      pageSize,
    };
  }

  private searchKind(
    kind: CounterpartyKind,
    orgId: string,
    like: string | null,
    limit: number,
    offset: number,
  ): Promise<KindResult> {
    if (kind === CounterpartyKind.SUPPLIER)
      return this.searchSuppliers(orgId, like, limit, offset);
    if (kind === CounterpartyKind.CUSTOMER)
      return this.searchCustomers(orgId, like, limit, offset);
    return this.searchEmployees(orgId, like, limit, offset);
  }

  private async searchSuppliers(
    orgId: string,
    like: string | null,
    limit: number,
    offset: number,
  ): Promise<KindResult> {
    const qb = this.providerRepo
      .createQueryBuilder('p')
      .where('p.organizationId = :orgId', { orgId })
      .andWhere('p.isActive = true');
    if (like)
      qb.andWhere('(p.name ILIKE :like OR p.code ILIKE :like)', { like });
    qb.orderBy('p.name', 'ASC').skip(offset).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return {
      total,
      items: rows.map((p) => ({
        kind: 'supplier' as const,
        id: p.id,
        code: p.code ?? null,
        name: p.name,
        phone: p.phone ?? null,
        address: p.address ?? p.notes ?? null,
      })),
    };
  }

  private async searchCustomers(
    orgId: string,
    like: string | null,
    limit: number,
    offset: number,
  ): Promise<KindResult> {
    const qb = this.customerRepo
      .createQueryBuilder('c')
      .where('c.organizationId = :orgId', { orgId })
      .andWhere('c.status != :merged', { merged: CustomerStatus.MERGED });
    if (like)
      qb.andWhere(
        '(c.name ILIKE :like OR c.code ILIKE :like OR c.phone ILIKE :like)',
        { like },
      );
    qb.orderBy('c.name', 'ASC').skip(offset).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return {
      total,
      items: rows.map((c) => ({
        kind: 'customer' as const,
        id: c.id,
        code: c.code ?? null,
        name: c.name,
        phone: c.phone ?? null,
        address: c.address ?? null,
      })),
    };
  }

  private async searchEmployees(
    orgId: string,
    like: string | null,
    limit: number,
    offset: number,
  ): Promise<KindResult> {
    const baseWhere = (qb: ReturnType<Repository<UserEntity>['createQueryBuilder']>) => {
      qb.leftJoin(
        EmployeeProfileEntity,
        'ep',
        // users.organization_id is uuid but employee_profiles.organization_id
        // (via BaseEntity) is varchar, so the join must cast. Raw snake_case:
        // TypeORM does not translate alias.property before a ::cast.
        'ep.user_id = u.id AND ep.organization_id::uuid = u.organization_id',
      )
        .where('u.organizationId = :orgId', { orgId })
        .andWhere('u.isActive = true');
      if (like)
        qb.andWhere(
          '(u.firstName ILIKE :like OR u.lastName ILIKE :like OR ep.code ILIKE :like)',
          { like },
        );
      return qb;
    };

    const rowsQb = baseWhere(this.userRepo.createQueryBuilder('u'))
      .select('u.id', 'id')
      .addSelect('u.firstName', 'firstName')
      .addSelect('u.lastName', 'lastName')
      .addSelect('ep.code', 'code')
      .addSelect('ep.mobile', 'mobile')
      .orderBy('u.firstName', 'ASC')
      .addOrderBy('u.lastName', 'ASC')
      .offset(offset)
      .limit(limit);
    const raw = await rowsQb.getRawMany<{
      id: string;
      firstName: string;
      lastName: string;
      code: string | null;
      mobile: string | null;
    }>();
    const total = await baseWhere(this.userRepo.createQueryBuilder('u')).getCount();

    return {
      total,
      items: raw.map((r) => ({
        kind: 'employee' as const,
        id: r.id,
        code: r.code ?? null,
        name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
        phone: r.mobile ?? null,
        address: null,
      })),
    };
  }
}
