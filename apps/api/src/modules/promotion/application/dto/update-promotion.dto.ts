import { CreatePromotionV2Dto } from './create-promotion.dto';

/**
 * Same shape as create — the client always resends the full form state
 * (the `type` control is disabled in the UI once the record exists, but the
 * DTO still carries it so the handler can reject an attempted change with
 * PROMOTION_TYPE_IMMUTABLE rather than silently ignoring it).
 */
export class UpdatePromotionV2Dto extends CreatePromotionV2Dto {}
