import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { ScopingPolicy, DeletionPolicy, CrudEntityConfig } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';
import { BaseCrudService } from './base-crud.service';

class TestEntity extends BaseEntity {}

class TestCrudService extends BaseCrudService<TestEntity, Record<string, any>, Record<string, any>> {
  protected readonly repository = {} as Repository<TestEntity>;
  protected readonly entityConfig = {
    entityKey: 'test',
    scopingPolicy: ScopingPolicy.ORGANIZATION,
    deletionPolicy: DeletionPolicy.HARD,
  } as CrudEntityConfig;

  sort(qb: SelectQueryBuilder<TestEntity>, sortBy?: string, sortOrder?: 'asc' | 'desc') {
    this.applySorting(qb, 'entity', sortBy, sortOrder);
  }
}

function queryBuilder() {
  return {
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
  } as unknown as SelectQueryBuilder<TestEntity> & {
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
  };
}

describe('BaseCrudService.applySorting', () => {
  const service = new TestCrudService({} as DataSource);

  it('defaults to createdAt DESC with id as the tiebreaker', () => {
    const qb = queryBuilder();
    service.sort(qb);
    expect(qb.orderBy).toHaveBeenCalledWith('entity.createdAt', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('entity.id', 'DESC');
  });

  it('keeps the requested column first and breaks ties by id in the same direction', () => {
    const qb = queryBuilder();
    service.sort(qb, 'name', 'asc');
    expect(qb.orderBy).toHaveBeenCalledWith('entity.name', 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('entity.id', 'ASC');
  });

  it('does not add id twice when sorting by id', () => {
    const qb = queryBuilder();
    service.sort(qb, 'id', 'asc');
    expect(qb.orderBy).toHaveBeenCalledWith('entity.id', 'ASC');
    expect(qb.addOrderBy).not.toHaveBeenCalled();
  });
});
