import {
  AccessModeEnum,
  WeekdayEnum,
  type AccessScheduleDay,
  type EmployeeAccess,
} from "./employee.types";

export const WEEKDAY_LABELS: Record<WeekdayEnum, string> = {
  [WeekdayEnum.MONDAY]: "Thứ 2",
  [WeekdayEnum.TUESDAY]: "Thứ 3",
  [WeekdayEnum.WEDNESDAY]: "Thứ 4",
  [WeekdayEnum.THURSDAY]: "Thứ 5",
  [WeekdayEnum.FRIDAY]: "Thứ 6",
  [WeekdayEnum.SATURDAY]: "Thứ 7",
  [WeekdayEnum.SUNDAY]: "Chủ nhật",
};

export function createDefaultAccessSchedule(): AccessScheduleDay[] {
  return Object.values(WeekdayEnum).map((weekday) => ({
    weekday,
    enabled: true,
    startTime: "00:00",
    endTime: "23:59",
  }));
}

export function createDefaultEmployeeAccess(): EmployeeAccess {
  return {
    mode: AccessModeEnum.FREE,
    schedule: createDefaultAccessSchedule(),
  };
}

export function normalizeEmployeeAccess(
  access: Partial<EmployeeAccess> | undefined,
): EmployeeAccess {
  const schedule =
    access?.schedule &&
    access.schedule.length === Object.values(WeekdayEnum).length
      ? access.schedule
      : createDefaultAccessSchedule();
  return {
    mode: access?.mode ?? AccessModeEnum.FREE,
    schedule,
  };
}
