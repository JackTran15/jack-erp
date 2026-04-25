import * as React from "react";
import { cn } from "../lib/utils";
import { Input } from "./input";

export interface DateTimeFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  includeTime?: boolean;
}

const DateTimeField = React.forwardRef<HTMLInputElement, DateTimeFieldProps>(
  ({ className, includeTime = false, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type={includeTime ? "datetime-local" : "date"}
        className={cn("max-w-xs", className)}
        {...props}
      />
    );
  },
);
DateTimeField.displayName = "DateTimeField";

export { DateTimeField };
