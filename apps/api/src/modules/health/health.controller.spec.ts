import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSource: jest.Mocked<Pick<DataSource, 'query'>>;

  beforeEach(async () => {
    dataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: dataSource }],
    }).compile();

    controller = module.get(HealthController);
  });

  describe('GET /health', () => {
    it('returns status ok with a timestamp', () => {
      const result = controller.check();

      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
      });
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('GET /health/db', () => {
    it('returns connected when the database responds', async () => {
      dataSource.query.mockResolvedValueOnce([{ '?column?': 1 }]);

      const result = await controller.checkDb();

      expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
      expect(result).toEqual({
        status: 'ok',
        database: 'connected',
        timestamp: expect.any(String),
      });
    });

    it('returns disconnected when the database throws', async () => {
      dataSource.query.mockRejectedValueOnce(new Error('connection refused'));

      const result = await controller.checkDb();

      expect(result).toEqual({
        status: 'error',
        database: 'disconnected',
        message: 'connection refused',
        timestamp: expect.any(String),
      });
    });
  });
});
