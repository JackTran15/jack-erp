import { ArgumentsHost, ConflictException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  it('formats custom conflict errors with the standardized top-level API error shape', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          method: 'PATCH',
          originalUrl: '/admin/entities/inventory-item-categories/records/cat-1',
          url: '/admin/entities/inventory-item-categories/records/cat-1',
          headers: { 'x-request-id': 'req-1' },
        }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new ConflictException({
        code: 'PRODUCT_GROUP_NAME_CONFLICT',
        message: 'Tên nhóm hàng đã tồn tại.',
        details: [{ field: 'name', reason: 'ALREADY_EXISTS' }],
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      code: 'PRODUCT_GROUP_NAME_CONFLICT',
      message: 'Tên nhóm hàng đã tồn tại.',
      statusCode: 409,
      timestamp: expect.any(String),
      path: '/admin/entities/inventory-item-categories/records/cat-1',
      requestId: 'req-1',
      details: [{ field: 'name', reason: 'ALREADY_EXISTS' }],
    });
  });
});
