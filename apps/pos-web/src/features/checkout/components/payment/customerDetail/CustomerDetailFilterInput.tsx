import { useState } from "react";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
  OPERATOR_OPTIONS,
} from "../../../constants/filterOperator";
import { PosSelect } from "../../common/forms/PosSelect";
import { PosTextInput } from "../../common/forms/PosTextInput";

interface CustomerDetailFilterInputProps {
  placeholder?: string;
  operatorType?: FilterOperatorTypeEnum;
  leadingOperator?: FilterOperatorEnum;
  align?: "left" | "right";
}

export function CustomerDetailFilterInput({
  placeholder,
  operatorType = FilterOperatorTypeEnum.TEXT,
  leadingOperator,
  align = "left",
}: CustomerDetailFilterInputProps) {
  const operatorOptions = OPERATOR_OPTIONS[operatorType];
  const defaultOperator =
    operatorOptions[0]?.value ?? FilterOperatorEnum.EQUALS;
  const [value, setValue] = useState("");
  const [operator, setOperator] = useState<FilterOperatorEnum>(
    leadingOperator ?? defaultOperator,
  );

  return (
    <div className="relative flex h-7 items-center bg-white">
      {leadingOperator ? (
        <PosSelect
          value={operator}
          onChange={setOperator}
          options={operatorOptions}
          className="w-8"
          menuClassName="left-0 min-w-[160px]"
          triggerClassName="flex items-center justify-center"
          variant="underline"
          showChevron={false}
        />
      ) : null}
      <PosTextInput
        value={value}
        onChange={setValue}
        placeholder={placeholder}
        align={align}
        variant="underline"
      />
    </div>
  );
}
