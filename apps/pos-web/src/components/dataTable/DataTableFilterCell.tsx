import { cn } from "@erp/ui";
import { useState } from "react";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
  OPERATOR_OPTIONS,
} from "@erp/pos/features/checkout/constants/filterOperator";
import { PosSelect } from "@erp/pos/features/checkout/components/common/forms/PosSelect";
import { PosTextInput } from "@erp/pos/features/checkout/components/common/forms/PosTextInput";

interface DataTableFilterCellProps {
  value?: string;
  onChange?: (next: string) => void;
  operatorType: FilterOperatorTypeEnum;
  leadingOperator?: FilterOperatorEnum;
  operator?: FilterOperatorEnum;
  onOperatorChange?: (next: FilterOperatorEnum) => void;
  align?: "left" | "right";
  placeholder?: string;
  className?: string;
}

/**
 * Shared underline-style filter cell used in table header filter rows.
 */
export function DataTableFilterCell({
  value,
  onChange,
  operatorType,
  leadingOperator,
  operator,
  onOperatorChange,
  align = "left",
  placeholder,
  className,
}: DataTableFilterCellProps) {
  const operatorOptions = OPERATOR_OPTIONS[operatorType];
  const fallbackOperator =
    operatorOptions[0]?.value ?? FilterOperatorEnum.EQUALS;
  const [innerValue, setInnerValue] = useState("");
  const [innerOperator, setInnerOperator] = useState<FilterOperatorEnum>(
    leadingOperator ?? fallbackOperator,
  );
  const currentValue = value ?? innerValue;
  const currentOperator =
    operator ?? (leadingOperator ? innerOperator : fallbackOperator);

  return (
    <div
      className={cn(
        "relative flex h-7 w-full min-w-0 items-center bg-white",
        className,
      )}
    >
      {leadingOperator ? (
        <PosSelect
          value={currentOperator}
          onChange={onOperatorChange ?? setInnerOperator}
          options={operatorOptions}
          className="w-8 shrink-0"
          menuClassName="left-0 min-w-[160px]"
          triggerClassName="flex items-center justify-center"
          variant="underline"
          showChevron={false}
        />
      ) : null}
      <PosTextInput
        value={currentValue}
        onChange={onChange ?? setInnerValue}
        placeholder={placeholder}
        align={align}
        variant="underline"
        className="min-w-0 flex-1"
      />
    </div>
  );
}
