import { ConfigService } from '@nestjs/config';
import { MetricsService } from './metrics.service';

const configWith = (values: Record<string, string>): ConfigService =>
  ({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  }) as unknown as ConfigService;

describe('MetricsService', () => {
  describe('enabled', () => {
    let service: MetricsService;

    beforeEach(() => {
      service = new MetricsService(
        configWith({ METRICS_ENABLED: 'true', METRICS_PREFIX: 'erp_' }),
      );
    });

    it('exposes prefixed default Node metrics', async () => {
      const output = await service.metrics();
      expect(output).toContain('erp_process_cpu_seconds_total');
    });

    it('records HTTP observations into the histogram and counter', async () => {
      service.observeHttp('GET', '/health', 200, 0.01);
      const output = await service.metrics();
      expect(output).toContain('erp_http_requests_total');
      expect(output).toContain('route="/health"');
      expect(output).toContain('erp_http_request_duration_seconds_bucket');
    });

    it('records domain metrics', async () => {
      service.observeKafkaPublish('inventory.item.created', 0.02);
      service.incCacheHit();
      service.incCacheMiss();
      service.observeCheckout('success', 0.5);
      service.incImportRows('success', 3);
      service.incImportJob('success');
      const output = await service.metrics();
      expect(output).toContain(
        'erp_kafka_events_published_total{topic="inventory.item.created"} 1',
      );
      expect(output).toContain('erp_redis_cache_hits_total 1');
      expect(output).toContain('erp_redis_cache_misses_total 1');
      expect(output).toContain('erp_pos_checkout_total{result="success"} 1');
      expect(output).toContain('erp_inventory_import_rows_total{result="success"} 3');
    });
  });

  describe('disabled', () => {
    let service: MetricsService;

    beforeEach(() => {
      service = new MetricsService(configWith({ METRICS_ENABLED: 'false' }));
    });

    it('collects nothing and every helper is a no-op', async () => {
      expect(service.enabled).toBe(false);
      // Must not throw even though no metric objects were created.
      service.observeHttp('GET', '/x', 200, 0.01);
      service.observeKafkaPublish('t', 0.01);
      service.incCacheHit();
      service.observeCheckout('error', 0.01);
      const output = await service.metrics();
      expect(output).not.toContain('http_requests_total');
      expect(output).not.toContain('process_cpu_seconds_total');
    });
  });
});
