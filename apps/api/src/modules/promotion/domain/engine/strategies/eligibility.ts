import { PromotionStatus } from '@erp/shared-interfaces';
import { PromotionProgram } from '../../model/promotion-program';
import { CartContext } from '../../model/cart';
import { DateWindow } from '../../model/value-objects/date-window';
import { TimeWindow } from '../../model/value-objects/time-window';
import { CustomerScope } from '../../model/value-objects/customer-scope';
import { EligibilityResult } from './promotion-strategy';

/** ISO day of week: 1=Monday..7=Sunday (matches `promotion_programs.days_of_week`). */
function isoDayOfWeek(date: Date): number {
  const jsDay = date.getDay(); // 0=Sunday..6=Saturday
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * The eligibility checks are identical across all 5 promotion types — every
 * strategy delegates its `isEligible()` to this single implementation.
 */
export function checkGenericEligibility(program: PromotionProgram, cart: CartContext): EligibilityResult {
  if (program.status === PromotionStatus.STOPPED) {
    return { eligible: false, reason: 'STOPPED' };
  }

  if (!DateWindow.of(program.startDate, program.endDate).contains(cart.at)) {
    return { eligible: false, reason: 'DATE_WINDOW' };
  }

  if (program.daysOfWeek.length > 0 && !program.daysOfWeek.includes(isoDayOfWeek(cart.at))) {
    return { eligible: false, reason: 'DAY_OF_WEEK' };
  }

  const timeWindow = TimeWindow.of(program.startTime, program.endTime);
  if (!timeWindow.contains(TimeWindow.timeOfDayFromDate(cart.at))) {
    return { eligible: false, reason: 'TIME_OF_DAY' };
  }

  if (program.branchIds.length > 0 && !program.branchIds.includes(cart.branchId)) {
    return { eligible: false, reason: 'BRANCH_SCOPE' };
  }

  const customerScope = CustomerScope.of({
    applyTo: program.applyTo,
    customerGroupIds: program.customerGroupIds,
    cardTierId: program.cardTierId,
    birthdayMatch: program.birthdayMatch,
    birthdayBeforeDays: program.birthdayBeforeDays,
    birthdayAfterDays: program.birthdayAfterDays,
  });
  if (!customerScope.matches(cart.customer, cart.at)) {
    return { eligible: false, reason: 'CUSTOMER_SCOPE' };
  }

  return { eligible: true };
}
