import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError, lastValueFrom } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

interface Observed {
  method: string;
  route: string;
  statusCode: number;
}

const buildContext = (
  request: { method: string; route?: { path: string } },
  statusCode: number,
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ statusCode }),
    }),
  }) as unknown as ExecutionContext;

describe('MetricsInterceptor', () => {
  let observed: Observed[];
  let metrics: MetricsService;
  let interceptor: MetricsInterceptor;

  beforeEach(() => {
    observed = [];
    metrics = {
      observeHttp: (method: string, route: string, statusCode: number) =>
        observed.push({ method, route, statusCode }),
    } as unknown as MetricsService;
    interceptor = new MetricsInterceptor(metrics);
  });

  it('labels the route with the matched route pattern', async () => {
    const ctx = buildContext(
      { method: 'GET', route: { path: '/pos/invoices/:id' } },
      200,
    );
    const next: CallHandler = { handle: () => of('ok') };
    await lastValueFrom(interceptor.intercept(ctx, next));
    expect(observed).toEqual([
      { method: 'GET', route: '/pos/invoices/:id', statusCode: 200 },
    ]);
  });

  it('falls back to "unmatched" when there is no matched route', async () => {
    const ctx = buildContext({ method: 'GET' }, 404);
    const next: CallHandler = { handle: () => of('missing') };
    await lastValueFrom(interceptor.intercept(ctx, next));
    expect(observed[0].route).toBe('unmatched');
  });

  it('records the exception status on the error path', async () => {
    const ctx = buildContext(
      { method: 'POST', route: { path: '/pos/invoices' } },
      200,
    );
    const next: CallHandler = {
      handle: () => throwError(() => ({ status: 400 })),
    };
    await expect(
      lastValueFrom(interceptor.intercept(ctx, next)),
    ).rejects.toBeDefined();
    expect(observed[0].statusCode).toBe(400);
  });
});
