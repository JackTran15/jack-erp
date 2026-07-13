import { ImportSuccessIllustration } from "./ImportSuccessIllustration";

interface Props {
  /** Counters shown under "Nhập khẩu thành công" (value + noun). */
  stats: Array<{ value: number; label: string }>;
}

export function ImportWizardComplete({ stats }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-10">
      <ImportSuccessIllustration />
      <p className="text-base text-muted-foreground">Nhập khẩu thành công</p>
      <div className="space-y-1 text-center text-base">
        {stats.map((stat) => (
          <p key={stat.label}>
            <strong className="text-xl font-semibold text-[#2563eb]">
              {stat.value}
            </strong>{" "}
            {stat.label}
          </p>
        ))}
      </div>
    </div>
  );
}
