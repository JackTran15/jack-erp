import { ForbiddenException } from '@nestjs/common';
import type { ActorContext } from '../decorators/actor-context.decorator';
import { resolveExplicitBranchId, withBranch } from './branch-request.util';

/**
 * Phạm vi chi nhánh của một request.
 *
 * Đáng khoá vì hỏng ở đây KHÔNG ồn ào: nó không ném, không log — nó trả về dữ
 * liệu của một cửa hàng khác trong khi màn hình nói tên cửa hàng này. Đúng hai
 * lần đã đo được trên dữ liệu dev (chứng từ kho, rồi hoá đơn đổi trả).
 */
describe('branch-request.util', () => {
  const actor = (over: Partial<ActorContext> = {}): ActorContext => ({
    userId: 'u-1',
    organizationId: 'org-1',
    branchId: 'b-1',
    branchIds: ['b-1', 'b-2'],
    roles: [],
    ...over,
  });

  describe('withBranch', () => {
    it('vắng yêu cầu -> trả về CHÍNH actor, không sao chép thừa', () => {
      const a = actor();
      expect(withBranch(a, undefined)).toBe(a);
    });

    it('xin đúng chi nhánh đang đứng -> trả về CHÍNH actor', () => {
      const a = actor();
      expect(withBranch(a, 'b-1')).toBe(a);
    });

    it('xin một chi nhánh KHÁC trong phân công -> bản SAO đã đổi chi nhánh', () => {
      const a = actor();
      const scoped = withBranch(a, 'b-2');

      expect(scoped.branchId).toBe('b-2');
      // Bản sao, không sửa tại chỗ: cùng một `ActorContext` được dùng lại ở
      // nhiều nhánh trong một request, nên sửa nó là đổi ngầm phạm vi chỗ khác.
      expect(scoped).not.toBe(a);
      expect(a.branchId).toBe('b-1');
    });

    it('xin chi nhánh NGOÀI phân công -> ném, KHÔNG lặng lẽ lùi về mặc định', () => {
      // Lùi im lặng nghĩa là màn hình nói một cửa hàng và bày dữ liệu của cửa
      // hàng khác — sai theo kiểu không ai phát hiện ra.
      expect(() => withBranch(actor(), 'b-9')).toThrow(ForbiddenException);
    });

    it('tài khoản chưa được phân công cửa hàng nào -> ném khi xin chỗ khác', () => {
      expect(() => withBranch(actor({ branchIds: [] }), 'b-2')).toThrow(ForbiddenException);
    });

    it('xin ĐÚNG chi nhánh đang đứng thì KHÔNG kiểm phân công', () => {
      // Thoát sớm ở vế `requested === actor.branchId`, TRƯỚC vế phân công. Đúng
      // chủ ý: xin chỗ mình đang đứng là không-làm-gì, và `branchIds` rỗng là ca
      // có thật (token mang `branchId` nhưng danh sách phân công chưa nạp).
      const a = actor({ branchIds: [] });
      expect(withBranch(a, 'b-1')).toBe(a);
    });
  });

  describe('resolveExplicitBranchId', () => {
    const req = (over: Record<string, unknown>) => ({ headers: {}, ...over }) as never;

    it('thứ tự: body > param > query > header', () => {
      expect(
        resolveExplicitBranchId(
          req({ body: { branchId: 'body' }, params: { branchId: 'param' }, query: { branchId: 'query' }, headers: { 'x-branch-id': 'hdr' } }),
        ),
      ).toBe('body');
      expect(resolveExplicitBranchId(req({ params: { branchId: 'param' }, query: { branchId: 'query' } }))).toBe('param');
      expect(resolveExplicitBranchId(req({ query: { branchId: 'query' }, headers: { 'x-branch-id': 'hdr' } }))).toBe('query');
      expect(resolveExplicitBranchId(req({ headers: { 'x-branch-id': 'hdr' } }))).toBe('hdr');
    });

    it('không có gì -> undefined', () => {
      expect(resolveExplicitBranchId(req({}))).toBeUndefined();
    });
  });
});
