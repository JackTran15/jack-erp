import { Check } from "lucide-react";
import { cn } from "@erp/ui";
import {
  ImportWizardStep,
  IMPORT_WIZARD_STEP_TITLES,
} from "./types";

const MISA_NAVY = "bg-[#1e3a6e] text-white";
const MISA_PENDING = "border border-gray-300 bg-white text-gray-500";

const STEP_ORDER: ImportWizardStep[] = [
  ImportWizardStep.FileSelect,
  ImportWizardStep.DataReview,
  ImportWizardStep.Complete,
];

interface Props {
  currentStep: ImportWizardStep;
}

function stepIndex(step: ImportWizardStep): number {
  return STEP_ORDER.indexOf(step);
}

function showStepCheckmark(step: ImportWizardStep, current: ImportWizardStep): boolean {
  const si = stepIndex(step);
  const ci = stepIndex(current);
  if (si < ci) return true;
  if (si === ci && current !== ImportWizardStep.FileSelect) return true;
  return false;
}

export function ImportWizardStepper({ currentStep }: Props) {
  const currentIndex = stepIndex(currentStep);

  return (
    <div className="mb-5 flex w-full items-stretch">
      {STEP_ORDER.map((step, index) => {
        const isReached = index <= currentIndex;
        const showCheck = showStepCheckmark(step, currentStep);

        return (
          <div key={step} className="flex min-w-0 flex-1 items-stretch">
            <div
              className={cn(
                "flex min-w-0 flex-1 items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium",
                isReached ? MISA_NAVY : MISA_PENDING,
              )}
            >
              <span className="truncate">
                {index + 1} {IMPORT_WIZARD_STEP_TITLES[step]}
              </span>
              {showCheck ? (
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    isReached ? "bg-white/20" : "bg-gray-100",
                  )}
                  aria-hidden
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              ) : (
                <span className="h-5 w-5 shrink-0" aria-hidden />
              )}
            </div>
            {index < STEP_ORDER.length - 1 ? (
              <div
                className="w-6 shrink-0 self-center border-t border-gray-300"
                aria-hidden
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
