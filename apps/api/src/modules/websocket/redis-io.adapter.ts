import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { ServerOptions } from 'socket.io';
import Redis from 'ioredis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor!: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);
  private pubClient!: Redis;
  private subClient!: Redis;

  constructor(
    app: INestApplication,
    private readonly config: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const host = this.config.get<string>('REDIS_HOST', 'localhost')!;
    const port = this.config.get<number>('REDIS_PORT', 6379)!;
    const password = this.config.get<string>('REDIS_PASSWORD') || undefined;
    const db = this.config.get<number>('REDIS_DB', 0)!;

    this.pubClient = new Redis({
      host,
      port,
      password,
      db,
      lazyConnect: false,
    });
    this.subClient = this.pubClient.duplicate();

    this.pubClient.on('error', (err) =>
      this.logger.error('Redis adapter pub client error', err.message),
    );
    this.subClient.on('error', (err) =>
      this.logger.error('Redis adapter sub client error', err.message),
    );

    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    this.logger.log('Redis IO adapter connected');
  }

  createIOServer(port: number, options?: Partial<ServerOptions>): unknown {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: '*',
        credentials: true,
      },
    });
    server.adapter(this.adapterConstructor);
    return server;
  }
}
