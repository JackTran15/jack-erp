import * as React from "react";
import { cn } from "../lib/utils";
import { Input } from "./input";

export interface DateTimeFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  includeTime?: boolean;
}

const dateTimeInputClassName = cn(
  "relative w-full max-w-none pr-10",
  "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-2",
  "[&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2",
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
  "[&::-webkit-datetime-edit-fields-wrapper]:flex-1",
);

const DateTimeField = React.forwardRef<HTMLInputElement, DateTimeFieldProps>(
  ({ className, includeTime = false, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type={includeTime ? "datetime-local" : "date"}
        className={cn(dateTimeInputClassName, className)}
        {...props}
      />
    );
  },
);
DateTimeField.displayName = "DateTimeField";

export { DateTimeField };
