import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Registry,
  Histogram,
  Counter,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * Owns the single prom-client Registry for the API and exposes typed helpers so
 * the rest of the codebase never imports prom-client directly. All metric
 * objects are created only when METRICS_ENABLED is on; when disabled every
 * helper is a no-op and the registry stays empty (cheap kill switch).
 */
@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  readonly enabled: boolean;
  readonly prefix: string;

  private httpDuration?: Histogram<string>;
  private httpTotal?: Counter<string>;
  private kafkaPublished?: Counter<string>;
  private kafkaPublishDuration?: Histogram<string>;
  private kafkaPublishErrors?: Counter<string>;
  private cacheHits?: Counter<string>;
  private cacheMisses?: Counter<string>;
  private checkoutDuration?: Histogram<string>;
  private checkoutTotal?: Counter<string>;
  private importRows?: Counter<string>;
  private importJobs?: Counter<string>;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>('METRICS_ENABLED', 'true') !== 'false';
    this.prefix = config.get<string>('METRICS_PREFIX', 'erp_');

    if (!this.enabled) {
      return;
    }

    collectDefaultMetrics({ register: this.registry, prefix: this.prefix });
    this.registerHttpMetrics();
    this.registerDomainMetrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  getRegistry(): Registry {
    return this.registry;
  }

  // ── HTTP (MetricsInterceptor) ─────────────────────────────────────────────

  observeHttp(
    method: string,
    route: string,
    statusCode: number,
    seconds: number,
  ): void {
    if (!this.enabled) return;
    const labels = { method, route, status_code: String(statusCode) };
    this.httpDuration!.observe(labels, seconds);
    this.httpTotal!.inc(labels);
  }

  // ── Kafka publish (EventPublisher) ────────────────────────────────────────

  observeKafkaPublish(topic: string, seconds: number): void {
    if (!this.enabled) return;
    this.kafkaPublished!.inc({ topic });
    this.kafkaPublishDuration!.observe({ topic }, seconds);
  }

  incKafkaPublishError(topic: string): void {
    if (!this.enabled) return;
    this.kafkaPublishErrors!.inc({ topic });
  }

  // ── Redis cache (CacheService) ────────────────────────────────────────────

  incCacheHit(): void {
    if (!this.enabled) return;
    this.cacheHits!.inc();
  }

  incCacheMiss(): void {
    if (!this.enabled) return;
    this.cacheMisses!.inc();
  }

  // ── POS checkout (CheckoutInvoiceService) ─────────────────────────────────

  observeCheckout(result: 'success' | 'error', seconds: number): void {
    if (!this.enabled) return;
    this.checkoutDuration!.observe({ result }, seconds);
    this.checkoutTotal!.inc({ result });
  }

  // ── Inventory CSV import (CsvImportService) ───────────────────────────────

  incImportRows(result: 'success' | 'failure', count = 1): void {
    if (!this.enabled || count <= 0) return;
    this.importRows!.inc({ result }, count);
  }

  incImportJob(result: 'success' | 'failure'): void {
    if (!this.enabled) return;
    this.importJobs!.inc({ result });
  }

  // ── Registration ──────────────────────────────────────────────────────────

  private registerHttpMetrics(): void {
    this.httpDuration = new Histogram({
      name: `${this.prefix}http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    this.httpTotal = new Counter({
      name: `${this.prefix}http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
  }

  private registerDomainMetrics(): void {
    this.kafkaPublished = new Counter({
      name: `${this.prefix}kafka_events_published_total`,
      help: 'Total number of Kafka events published',
      labelNames: ['topic'],
      registers: [this.registry],
    });
    this.kafkaPublishDuration = new Histogram({
      name: `${this.prefix}kafka_publish_duration_seconds`,
      help: 'Kafka publish duration in seconds',
      labelNames: ['topic'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });
    this.kafkaPublishErrors = new Counter({
      name: `${this.prefix}kafka_publish_errors_total`,
      help: 'Total number of Kafka publish errors',
      labelNames: ['topic'],
      registers: [this.registry],
    });

    this.cacheHits = new Counter({
      name: `${this.prefix}redis_cache_hits_total`,
      help: 'Total number of Redis cache hits',
      registers: [this.registry],
    });
    this.cacheMisses = new Counter({
      name: `${this.prefix}redis_cache_misses_total`,
      help: 'Total number of Redis cache misses',
      registers: [this.registry],
    });

    this.checkoutDuration = new Histogram({
      name: `${this.prefix}pos_checkout_duration_seconds`,
      help: 'POS checkout duration in seconds',
      labelNames: ['result'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    this.checkoutTotal = new Counter({
      name: `${this.prefix}pos_checkout_total`,
      help: 'Total number of POS checkouts',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.importRows = new Counter({
      name: `${this.prefix}inventory_import_rows_total`,
      help: 'Total number of inventory import rows processed',
      labelNames: ['result'],
      registers: [this.registry],
    });
    this.importJobs = new Counter({
      name: `${this.prefix}inventory_import_jobs_total`,
      help: 'Total number of inventory import jobs completed',
      labelNames: ['result'],
      registers: [this.registry],
    });
  }
}
