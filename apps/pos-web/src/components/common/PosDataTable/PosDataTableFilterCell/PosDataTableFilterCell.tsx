import { cn } from "@erp/ui";
import { useState } from "react";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
  OPERATOR_OPTIONS,
} from "@erp/pos/constants/checkout.constant";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";

interface PosDataTableFilterCellProps {
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
export function PosDataTableFilterCell({
  value,
  onChange,
  operatorType,
  leadingOperator,
  operator,
  onOperatorChange,
  align = "left",
  placeholder,
  className,
}: PosDataTableFilterCellProps) {
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
          value={
            operatorOptions.find((o) => o.value === currentOperator) ?? null
          }
          onChange={(item) =>
            (onOperatorChange ?? setInnerOperator)(item.value)
          }
          items={operatorOptions}
          itemKey={(o) => o.value}
          renderItem={(o) => o.label}
          renderSelected={(o) => o.selectedDisplay}
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
