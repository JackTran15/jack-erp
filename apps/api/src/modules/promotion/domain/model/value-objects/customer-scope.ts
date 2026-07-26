import { PromotionApplyTo, PromotionBirthdayMatch } from '@erp/shared-interfaces';

export interface CustomerScopeCustomer {
  id: string;
  groupId?: string;
  birthDate?: Date;
  cardTierId?: string;
}

export interface CustomerScopeProps {
  applyTo: PromotionApplyTo;
  customerGroupIds: string[];
  cardTierId?: string;
  birthdayMatch?: PromotionBirthdayMatch;
  birthdayBeforeDays?: number;
  birthdayAfterDays?: number;
}

function mondayFirstOffset(jsDay: number): number {
  // JS getDay(): 0=Sunday..6=Saturday. Convert to a Monday-first offset (0=Monday..6=Sunday).
  return (jsDay + 6) % 7;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

function isWithinCalendarRange(target: Date, start: Date, end: Date): boolean {
  const t = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const s = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const e = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return t >= s && t <= e;
}

/**
 * Every year `at` could plausibly need to be compared against, given a birthday
 * whose week/range might wrap across a year boundary (e.g. birthday Dec 30,
 * `at` = Jan 2 of the following year).
 */
function candidateYears(at: Date): number[] {
  const year = at.getFullYear();
  return [year - 1, year, year + 1];
}

/** Resolves REQ FR-021's "apply to" scope, including all 4 birthday-match modes. */
export class CustomerScope {
  private constructor(private readonly props: CustomerScopeProps) {}

  static of(props: CustomerScopeProps): CustomerScope {
    return new CustomerScope(props);
  }

  matches(customer: CustomerScopeCustomer | undefined, at: Date): boolean {
    switch (this.props.applyTo) {
      case PromotionApplyTo.ALL_CUSTOMERS:
        return true;
      case PromotionApplyTo.CUSTOMER_GROUP:
        return !!customer?.groupId && this.props.customerGroupIds.includes(customer.groupId);
      case PromotionApplyTo.CARD_TIER:
        return !!customer?.cardTierId && customer.cardTierId === this.props.cardTierId;
      case PromotionApplyTo.BIRTHDAY:
        return this.matchesBirthday(customer, at);
      default:
        return false;
    }
  }

  private matchesBirthday(customer: CustomerScopeCustomer | undefined, at: Date): boolean {
    if (!customer?.birthDate) return false;
    const birthDate = customer.birthDate;

    switch (this.props.birthdayMatch) {
      case PromotionBirthdayMatch.EXACT_DAY:
        return birthDate.getMonth() === at.getMonth() && birthDate.getDate() === at.getDate();

      case PromotionBirthdayMatch.SAME_MONTH:
        return birthDate.getMonth() === at.getMonth();

      case PromotionBirthdayMatch.SAME_WEEK:
        return candidateYears(at).some((year) => {
          const birthdayThisYear = new Date(year, birthDate.getMonth(), birthDate.getDate());
          const weekStart = addDays(birthdayThisYear, -mondayFirstOffset(birthdayThisYear.getDay()));
          const weekEnd = addDays(weekStart, 6);
          return isWithinCalendarRange(at, weekStart, weekEnd);
        });

      case PromotionBirthdayMatch.RANGE:
        return candidateYears(at).some((year) => {
          const birthdayThisYear = new Date(year, birthDate.getMonth(), birthDate.getDate());
          const rangeStart = addDays(birthdayThisYear, -(this.props.birthdayBeforeDays ?? 0));
          const rangeEnd = addDays(birthdayThisYear, this.props.birthdayAfterDays ?? 0);
          return isWithinCalendarRange(at, rangeStart, rangeEnd);
        });

      default:
        return false;
    }
  }
}
