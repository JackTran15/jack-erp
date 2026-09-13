import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { MobileEvaluateCartDto } from './mobile-evaluate-cart.dto';

// Mirrors the global pipe registered in main.ts, so what passes here is what
// passes in production. `forbidNonWhitelisted` is the load-bearing flag: an
// undeclared key is a 400 for the whole call, not a silently dropped field.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const meta: ArgumentMetadata = { type: 'body', metatype: MobileEvaluateCartDto };

const run = (value: Record<string, unknown>) => pipe.transform(value, meta) as Promise<MobileEvaluateCartDto>;

const line = (extra: Record<string, unknown> = {}) => ({
  lineId: 'line-1',
  itemId: '3f1b9a2c-0d4e-4f6a-8b7c-1d2e3f4a5b6c',
  quantity: 2,
  unitPrice: 100_000,
  ...extra,
});

describe('MobileEvaluateCartDto', () => {
  it('accepts manualLineDiscount on a line', async () => {
    // Opened for mobile on 2026-09-11 so the consultant's order screen can
    // apply a per-line discount. Before that this exact body was a 400.
    const dto = await run({ lines: [line({ manualLineDiscount: 25_000 })] });

    expect(dto.lines[0].manualLineDiscount).toBe(25_000);
  });

  it('treats manualLineDiscount as optional', async () => {
    const dto = await run({ lines: [line()] });

    expect(dto.lines[0].manualLineDiscount).toBeUndefined();
  });

  it('rejects a negative manualLineDiscount', async () => {
    // A negative "discount" is a price increase wearing the wrong name.
    await expect(run({ lines: [line({ manualLineDiscount: -1 })] })).rejects.toThrow();
  });

  it('still rejects the web-only fields the mobile DTO deliberately omits', async () => {
    // These three are the whole reason the mobile DTO exists as a narrower
    // copy. A regression that widens it would otherwise be invisible.
    await expect(run({ at: new Date().toISOString(), lines: [line()] })).rejects.toThrow();
    await expect(
      run({ excludedProgramIds: ['3f1b9a2c-0d4e-4f6a-8b7c-1d2e3f4a5b6c'], lines: [line()] }),
    ).rejects.toThrow();
  });
});
