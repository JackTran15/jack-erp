export interface NoteInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

/** Borderless "ghost" textarea for invoice notes. */
export function NoteInput({
  value,
  onChange,
  placeholder = "Ghi chú ...",
}: NoteInputProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="block w-full resize-none border-0 border-b border-transparent bg-transparent px-0 py-2 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-0"
    />
  );
}
