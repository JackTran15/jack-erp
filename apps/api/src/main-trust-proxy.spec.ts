import { Controller, Get, Module, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

// Exercises the exact mechanism main.ts relies on (ADR-03,
// .ai/features/api-key-auth/03-logical-design.md): once `trust proxy` is
// set, Express derives `req.ip` from X-Forwarded-For instead of the raw
// socket address. Bootstrapping the real AppModule here would pull in
// DB/Redis/Kafka, so this isolates just the trust-proxy wiring.
@Controller()
class PingController {
  @Get('ping')
  ping(@Req() req: any) {
    return { ip: req.ip };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

describe('trust proxy (main.ts bootstrap step)', () => {
  it('derives req.ip from X-Forwarded-For once trust proxy is set', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PingModule],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', 1);
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/ping')
      .set('X-Forwarded-For', '203.0.113.5');

    expect(res.body.ip).toBe('203.0.113.5');
    await app.close();
  });

  it('without trust proxy, X-Forwarded-For is ignored', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PingModule],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/ping')
      .set('X-Forwarded-For', '203.0.113.5');

    expect(res.body.ip).not.toBe('203.0.113.5');
    await app.close();
  });

  // Caught live, not by a unit test with a mocked ConfigService: dotenv (and
  // therefore ConfigService.get) always yields a STRING for a value that
  // came from an env file — including TRUST_PROXY_HOPS's .env.example
  // fallback. Express's `trust proxy` treats a string completely
  // differently from a number: `'1'` is parsed as a trusted-*subnet* spec
  // (an invalid one), not "trust 1 hop", and silently keeps using the raw
  // socket address. main.ts must `Number(...)` the config value — this test
  // pins that behaviour so the cast can't be quietly dropped again.
  it('a STRING hop count (dotenv reality) breaks XFF trust — the cast in main.ts is load-bearing', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PingModule],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', '1' as any); // what ConfigService.get() actually returns
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/ping')
      .set('X-Forwarded-For', '203.0.113.5');

    expect(res.body.ip).not.toBe('203.0.113.5');
    await app.close();
  });

  it('Number(...) around the string hop count restores correct XFF trust', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PingModule],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', Number('1' as any));
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/ping')
      .set('X-Forwarded-For', '203.0.113.5');

    expect(res.body.ip).toBe('203.0.113.5');
    await app.close();
  });
});
