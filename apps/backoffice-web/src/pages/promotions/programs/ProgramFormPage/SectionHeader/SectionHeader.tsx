interface Props {
  title: string;
}

/** Tiêu đề nhóm field: chữ HOA, màu muted, tạo nhịp chia section trong form. */
export function SectionHeader({ title }: Props) {
  return (
    <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
      {title}
    </h2>
  );
}
