import { useEffect, useRef, useState } from "react";

export interface PrintSettingsPreviewProps {
  /** HTML sinh bởi `renderInvoiceHtml` — đúng chuỗi sẽ được gửi đi in. */
  html: string;
  /** `pageWidth` đang chọn ("80mm" | "auto" | …) — quyết định bề rộng khung giấy. */
  pageWidth: string;
}

/** Khổ giấy dùng để vẽ khung khi người dùng chọn "auto". */
const FALLBACK_PAPER_WIDTH = "80mm";

/**
 * Preview bản in. Render `html` trong iframe đặt ĐÚNG bề rộng khổ giấy: iframe
 * cắt phần tràn giống hệt cách máy in cắt mép giấy, nên nội dung lòi ra ngoài
 * khung nét đứt chính là phần sẽ mất khi in.
 *
 * Cố ý dùng lại chuỗi HTML từ `renderInvoiceHtml` thay vì dựng lại giao diện
 * bằng React — preview dựng riêng sẽ trôi lệch khỏi bản in thật và làm hỏng
 * toàn bộ vòng lặp tinh chỉnh.
 */
export function PrintSettingsPreview({
  html,
  pageWidth,
}: PrintSettingsPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(600);

  // srcDoc đổi mỗi lần chỉnh thông số → đo lại chiều cao nội dung để iframe
  // không cắt cụt bill theo chiều dọc (chiều dọc là giấy cuộn, không giới hạn).
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const measure = () => {
      // `contentDocument` đã tồn tại nhưng `documentElement` còn null trong
      // khoảng iframe chưa parse xong srcDoc — phải optional-chain cả hai.
      const body = iframe.contentDocument?.body;
      if (!body) return;
      // Đo `body` chứ KHÔNG đo `documentElement`: scrollHeight của
      // documentElement luôn ≥ chiều cao viewport iframe, mà viewport lại do
      // chính state `height` này quyết định — vòng lặp đó khiến khung chỉ phình
      // ra chứ không bao giờ co lại khi bill ngắn đi.
      const next = Math.ceil(body.getBoundingClientRect().height);
      if (next > 0) setHeight(next);
    };

    iframe.addEventListener("load", measure);
    // Nội dung có thể đã sẵn sàng trước khi listener kịp gắn (srcDoc nhỏ, parse
    // đồng bộ) → đo luôn một nhịp, và một nhịp nữa sau khi layout ổn định.
    measure();
    const raf = requestAnimationFrame(measure);

    return () => {
      cancelAnimationFrame(raf);
      iframe.removeEventListener("load", measure);
    };
  }, [html]);

  const paperWidth = pageWidth === "auto" ? FALLBACK_PAPER_WIDTH : pageWidth;

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-[11px] text-gray-500">
        Khung nét đứt = mép giấy {paperWidth}
        {pageWidth === "auto" ? " (ước lượng, khổ đang để auto)" : ""}. Nội dung
        tràn ra ngoài khung là phần sẽ bị cắt khi in.
      </p>
      <div
        className="border border-dashed border-red-400 bg-white"
        style={{ width: paperWidth }}
      >
        <iframe
          ref={iframeRef}
          title="Xem trước bản in"
          srcDoc={html}
          className="block w-full border-0"
          style={{ height }}
        />
      </div>
    </div>
  );
}
