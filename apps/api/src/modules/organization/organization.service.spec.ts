import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  OrganizationEntity,
  OrganizationStatus,
} from './organization.entity';
import { OrganizationService } from './organization.service';
import { CoaSeederService } from '../accounting/seeders/coa-seeder.service';
import { CashVoucherCategorySeederService } from '../accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.seeder';
import { MembershipCardTypeSeederService } from '../customer/services/membership-card-type.seeder';
import { ActorContext } from '../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  roles: ['admin'],
};

const orgStub: Partial<OrganizationEntity> = {
  id: 'org-1',
  organizationId: 'org-1',
  name: 'Acme Corp',
  contactEmail: 'info@acme.com',
  status: OrganizationStatus.ACTIVE,
  createdBy: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('OrganizationService', () => {
  let service: OrganizationService;
  let orgRepo: {
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let coaSeederService: { seedForOrganization: jest.Mock };
  let cashVoucherCategorySeederService: { seedForOrganization: jest.Mock };
  let membershipCardTypeSeederService: { seedForOrganization: jest.Mock };

  beforeEach(async () => {
    orgRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn((dto) => ({ ...orgStub, ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      update: jest.fn(),
    };
    coaSeederService = { seedForOrganization: jest.fn().mockResolvedValue(15) };
    cashVoucherCategorySeederService = {
      seedForOrganization: jest.fn().mockResolvedValue(7),
    };
    membershipCardTypeSeederService = {
      seedForOrganization: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: getRepositoryToken(OrganizationEntity), useValue: orgRepo },
        { provide: CoaSeederService, useValue: coaSeederService },
        {
          provide: CashVoucherCategorySeederService,
          useValue: cashVoucherCategorySeederService,
        },
        {
          provide: MembershipCardTypeSeederService,
          useValue: membershipCardTypeSeederService,
        },
      ],
    }).compile();

    service = module.get(OrganizationService);
  });

  describe('create', () => {
    it('creates an organization successfully', async () => {
      orgRepo.findOne.mockResolvedValue(null);

      const result = await service.create(
        { name: 'New Org', contactEmail: 'new@org.com' },
        actor,
      );

      expect(orgRepo.findOne).toHaveBeenCalledWith({
        where: { name: 'New Org' },
      });
      expect(orgRepo.create).toHaveBeenCalled();
      expect(orgRepo.save).toHaveBeenCalled();
      expect(result.name).toBe('New Org');
      expect(result.status).toBe(OrganizationStatus.ACTIVE);
      expect(coaSeederService.seedForOrganization).toHaveBeenCalledWith(
        result.id,
        'user-1',
      );
    });

    it('does not fail organization create when COA seed throws', async () => {
      orgRepo.findOne.mockResolvedValue(null);
      coaSeederService.seedForOrganization.mockRejectedValue(new Error('db error'));

      await expect(
        service.create({ name: 'New Org', contactEmail: 'a@b.com' }, actor),
      ).resolves.toBeDefined();
    });

    it('throws ConflictException when name already exists', async () => {
      orgRepo.findOne.mockResolvedValue(orgStub);

      await expect(
        service.create({ name: 'Acme Corp', contactEmail: 'dup@acme.com' }, actor),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findById', () => {
    it('returns the organization scoped to actor org', async () => {
      orgRepo.findOne.mockResolvedValue(orgStub);

      const result = await service.findById('org-1', actor);

      expect(orgRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'org-1', organizationId: 'org-1' },
      });
      expect(result).toEqual(orgStub);
    });

    it('throws NotFoundException when org does not exist', async () => {
      orgRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('list', () => {
    it('returns paginated results', async () => {
      orgRepo.findAndCount.mockResolvedValue([[orgStub], 1]);

      const result = await service.list({ page: 1, pageSize: 10 }, actor);

      expect(orgRepo.findAndCount).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        skip: 0,
        take: 10,
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual({
        data: [orgStub],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    });
  });

  describe('update', () => {
    it('updates organization fields', async () => {
      orgRepo.findOne.mockResolvedValue({ ...orgStub });

      const result = await service.update(
        'org-1',
        { contactEmail: 'updated@acme.com' },
        actor,
      );

      expect(result.contactEmail).toBe('updated@acme.com');
      expect(orgRepo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when org to update does not exist', async () => {
      orgRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('missing', { contactEmail: 'nope@acme.com' }, actor),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
