import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PromotionValidationIssue } from "../../api/use-promotions";

/**
 * Lỗi 400 theo từng trường từ BR-004 (`DomainValidationError.issues`).
 *
 * Dùng Context thay vì truyền prop: form có 5 variant × ~11 section dùng chung,
 * prop-drilling `issues` qua từng lớp sẽ chạm vào mọi component chỉ để chuyển
 * tiếp một giá trị không ai ở giữa quan tâm.
 */
const PromotionIssuesContext = createContext<Map<string, string>>(new Map());

interface Props {
  issues: PromotionValidationIssue[];
  children: ReactNode;
}

export function PromotionIssuesProvider({ issues, children }: Props) {
  const byField = useMemo(() => {
    const map = new Map<string, string>();
    // Lỗi đầu tiên của mỗi trường là lỗi hiển thị; các lỗi sau cùng trường hiếm
    // và không đáng chồng chữ lên nhau dưới một ô nhập.
    for (const issue of issues) {
      if (!map.has(issue.field)) map.set(issue.field, issue.message);
    }
    return map;
  }, [issues]);

  return (
    <PromotionIssuesContext.Provider value={byField}>
      {children}
    </PromotionIssuesContext.Provider>
  );
}

/** Thông báo lỗi của một trường, hoặc `undefined` nếu trường đó không có lỗi. */
export function useFieldIssue(field: string): string | undefined {
  return useContext(PromotionIssuesContext).get(field);
}
