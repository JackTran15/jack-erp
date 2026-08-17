import { PromotionProgram } from '../model/promotion-program';

export const PROMOTION_REPOSITORY = Symbol('PROMOTION_REPOSITORY');

export interface PromotionRepositoryPort {
  /** Programs that pass the coarse SQL filter: TRACKING + date window + branch scope. */
  findActive(orgId: string, branchId: string, at: Date): Promise<PromotionProgram[]>;
  findById(orgId: string, id: string): Promise<PromotionProgram | null>;
  save(program: PromotionProgram): Promise<PromotionProgram>;
  softDelete(orgId: string, id: string): Promise<void>;
}
