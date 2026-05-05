import { Link, useNavigate, useParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, FileQuestion, Home, ServerCrash, ShieldAlert } from "lucide-react";
import { Button } from "@erp/ui";

const ERROR_COPY: Record<
  number,
  { title: string; description: string; Icon: LucideIcon }
> = {
  403: {
    title: "Không có quyền truy cập",
    description:
      "Tài khoản của bạn không được phép xem tài nguyên này. Liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.",
    Icon: ShieldAlert,
  },
  404: {
    title: "Không tìm thấy trang",
    description:
      "Đường dẫn có thể đã đổi hoặc trang đã được gỡ bỏ. Hãy kiểm tra URL hoặc quay lại trang trước.",
    Icon: FileQuestion,
  },
  500: {
    title: "Lỗi máy chủ nội bộ",
    description:
      "Đã xảy ra sự cố khi xử lý yêu cầu. Vui lòng thử lại sau ít phút hoặc liên hệ bộ phận hỗ trợ.",
    Icon: ServerCrash,
  },
  502: {
    title: "Cổng hoặc máy chủ không phản hồi",
    description:
      "Hệ thống phía sau đang quá tải hoặc tạm ngưng. Vui lòng tải lại trang sau giây lát.",
    Icon: ServerCrash,
  },
};

function parseHttpCode(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return 404;
  return n;
}

export function HttpErrorPage() {
  const { code } = useParams<{ code: string }>();
  const n = parseHttpCode(code);
  return <HttpErrorView code={n} />;
}

export interface HttpErrorViewProps {
  code: number;
}

/**
 * Màn hình lỗi HTTP (403, 404, 500, 502, …) — dùng trong router hoặc `path="*"`.
 */
const GENERIC_ERROR = {
  title: "Đã xảy ra lỗi",
  description:
    "Không thể hoàn tất yêu cầu. Vui lòng thử lại sau hoặc liên hệ bộ phận hỗ trợ nếu lỗi vẫn tiếp diễn.",
  Icon: ServerCrash,
} as const;

export function HttpErrorView({ code }: HttpErrorViewProps) {
  const navigate = useNavigate();
  const meta = ERROR_COPY[code] ?? GENERIC_ERROR;
  const { title, description, Icon } = meta;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] w-full flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card px-8 py-10 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <Icon className="h-10 w-10 text-muted-foreground" aria-hidden />
        </div>
        <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Lỗi {code}
        </p>
        <h1 className="mb-3 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại
          </Button>
          <Button type="button" asChild>
            <Link to="/">
              <Home className="mr-2 h-4 w-4" />
              Về trang chủ
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
