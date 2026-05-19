import { Input, Label, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@erp/ui";
import { HelpCircle } from "lucide-react";
import {
  createDefaultAccessSchedule,
  WEEKDAY_LABELS,
} from "../employee-access";
import {
  AccessModeEnum,
  type AccessScheduleDay,
  type EmployeeFormDraft,
} from "../employee.types";

interface EmployeeAccessTimeTabProps {
  draft: EmployeeFormDraft;
  onChange: (draft: EmployeeFormDraft) => void;
}

export function EmployeeAccessTimeTab({ draft, onChange }: EmployeeAccessTimeTabProps) {
  const { access } = draft;

  const setMode = (mode: AccessModeEnum) => {
    onChange({
      ...draft,
      access: {
        ...access,
        mode,
        schedule:
          access.schedule.length > 0 ? access.schedule : createDefaultAccessSchedule(),
      },
    });
  };

  const updateScheduleDay = (
    weekday: AccessScheduleDay["weekday"],
    patch: Partial<AccessScheduleDay>,
  ) => {
    onChange({
      ...draft,
      access: {
        ...access,
        schedule: access.schedule.map((day) =>
          day.weekday === weekday ? { ...day, ...patch } : day,
        ),
      },
    });
  };

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label>Quyền truy cập</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground" aria-label="Trợ giúp">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Chọn Truy cập theo khung giờ nếu muốn giới hạn thời gian sử dụng phần mềm của
                nhân viên
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex flex-col gap-3 pt-1 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="accessMode"
              checked={access.mode === AccessModeEnum.FREE}
              onChange={() => setMode(AccessModeEnum.FREE)}
            />
            Truy cập tự do
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="accessMode"
              checked={access.mode === AccessModeEnum.SCHEDULED}
              onChange={() => setMode(AccessModeEnum.SCHEDULED)}
            />
            Truy cập theo khung giờ
          </label>
        </div>
      </div>

      {access.mode === AccessModeEnum.SCHEDULED && (
        <div className="space-y-3">
          <Label>Thời gian truy cập</Label>
          <div className="space-y-2">
            {access.schedule.map((day) => (
              <div
                key={day.weekday}
                className="flex flex-wrap items-center gap-3 text-sm"
              >
                <label className="flex w-28 shrink-0 items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={day.enabled}
                    onChange={(e) => updateScheduleDay(day.weekday, { enabled: e.target.checked })}
                  />
                  <span>{WEEKDAY_LABELS[day.weekday]}</span>
                </label>
                <Input
                  type="time"
                  className="h-9 w-[120px]"
                  value={day.startTime}
                  disabled={!day.enabled}
                  onChange={(e) => updateScheduleDay(day.weekday, { startTime: e.target.value })}
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  type="time"
                  className="h-9 w-[120px]"
                  value={day.endTime}
                  disabled={!day.enabled}
                  onChange={(e) => updateScheduleDay(day.weekday, { endTime: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

