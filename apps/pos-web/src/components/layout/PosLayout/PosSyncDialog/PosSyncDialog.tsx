import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";

export interface PosSyncDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PosSyncDialog({ open, onClose }: PosSyncDialogProps) {
  return (
    <PosDialog open={open} onClose={onClose} width={560}>
      <PosDialog.Header title="Đồng bộ đơn hàng" />
      <PosDialog.Body className="py-10">
        <div className="flex flex-col items-center justify-center gap-6">
          <EmptyOrdersIllustration />
          <p className="text-sm italic text-gray-400">
            Không có đơn hàng nào!
          </p>
        </div>
      </PosDialog.Body>
      <PosDialog.Footer onCancel={onClose} cancelLabel="Đóng" />
    </PosDialog>
  );
}

function EmptyOrdersIllustration() {
  return (
    <svg
      width="200"
      height="180"
      viewBox="0 0 200 180"
      fill="none"
      role="img"
      aria-label="Không có đơn hàng"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="100" cy="158" rx="72" ry="8" fill="#F3F4F6" />

      <g>
        <path d="M30 92 L60 80 L60 138 L30 150 Z" fill="#E0E7FF" />
        <path d="M60 80 L82 86 L82 144 L60 138 Z" fill="#A5B4FC" />
      </g>

      <g>
        <path d="M170 90 L140 78 L140 136 L170 148 Z" fill="#E0E7FF" />
        <path d="M140 78 L118 84 L118 142 L140 136 Z" fill="#A5B4FC" />
      </g>

      <g>
        <path
          d="M68 88 L100 76 L132 88 L132 146 L100 158 L68 146 Z"
          fill="#6366F1"
        />
        <path d="M68 88 L100 100 L132 88 L100 76 Z" fill="#A5B4FC" />
        <path d="M100 100 L100 158" stroke="#4F46E5" strokeWidth="1.2" />

        <path d="M82 84 L100 92 L100 100 L82 92 Z" fill="#A5B4FC" />
        <path d="M118 84 L100 92 L100 100 L118 92 Z" fill="#C7D2FE" />

        <circle cx="90" cy="124" r="2.2" fill="#1F2937" />
        <circle cx="110" cy="124" r="2.2" fill="#1F2937" />
        <path
          d="M92 138 Q100 132 108 138"
          stroke="#1F2937"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      <g>
        <ellipse
          cx="138"
          cy="40"
          rx="20"
          ry="16"
          fill="#FFFFFF"
          stroke="#1F2937"
          strokeWidth="1.5"
        />
        <circle cx="124" cy="60" r="2.4" fill="#FFFFFF" stroke="#1F2937" strokeWidth="1.2" />
        <circle cx="118" cy="68" r="1.6" fill="#FFFFFF" stroke="#1F2937" strokeWidth="1" />
        <text
          x="138"
          y="46"
          textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="18"
          fontWeight="700"
          fill="#1F2937"
        >
          ?
        </text>
      </g>
    </svg>
  );
}
