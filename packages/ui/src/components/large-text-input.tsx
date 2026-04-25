import * as React from "react";
import { cn } from "../lib/utils";
import { Textarea } from "./textarea";

export interface LargeTextInputProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const LargeTextInput = React.forwardRef<
  HTMLTextAreaElement,
  LargeTextInputProps
>(({ className, ...props }, ref) => {
  return (
    <Textarea
      ref={ref}
      className={cn("min-h-[160px] resize-y", className)}
      {...props}
    />
  );
});
LargeTextInput.displayName = "LargeTextInput";

export { LargeTextInput };
