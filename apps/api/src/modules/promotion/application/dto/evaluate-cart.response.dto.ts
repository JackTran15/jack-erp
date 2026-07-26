import { EvaluateCartResponse } from '@erp/shared-interfaces';
import { PromotionEvaluation } from '../../domain/model/evaluation';

/** Decouples the domain-owned PromotionEvaluation shape from the wire contract at the interface boundary. */
export function toEvaluateResponse(evaluation: PromotionEvaluation): EvaluateCartResponse {
  return {
    subtotal: evaluation.subtotal,
    promotionDiscount: evaluation.promotionDiscount,
    amountAfterPromotion: evaluation.amountAfterPromotion,
    appliedPrograms: evaluation.appliedPrograms,
    availablePrograms: evaluation.availablePrograms,
    skippedPrograms: evaluation.skippedPrograms,
  };
}
