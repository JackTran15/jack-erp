import { Check, Store } from "lucide-react";

export function ImportSuccessIllustration() {
  return (
    <div className="relative inline-flex">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <Store className="h-16 w-16 text-[#c2410c]" strokeWidth={1.25} />
        <div className="mt-1 flex justify-center gap-0.5">
          <span className="h-2 w-8 rounded-sm bg-red-500" />
          <span className="h-2 w-8 rounded-sm bg-white border border-red-400" />
        </div>
      </div>
      <span className="absolute -bottom-1 -right-2 flex h-9 w-9 items-center justify-center rounded-full bg-green-500 shadow-md">
        <Check className="h-5 w-5 text-white" strokeWidth={3} />
      </span>
    </div>
  );
}
