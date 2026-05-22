import { create } from "zustand";
import {
  VOUCHER_PARTNER_DEFAULT_KIND,
  VoucherPartnerKindUi,
} from "./voucher-partner.constants";
import type { VoucherMergedPartnerOption } from "./voucher-partner-search";

export type VoucherEntitySearchTarget = "partner" | "staff" | "debtCollection";

export interface VoucherEntitySearchCacheEntry {
  items: VoucherMergedPartnerOption[];
  hasMore: boolean;
  total: number | null;
}

export interface VoucherEntitySearchSession {
  kindFilter: VoucherPartnerKindUi;
  page: number;
  pageSize: number;
  searchInput: string;
  committedQuery: string;
  selectedKey: string | null;
}

const DEFAULT_PAGE_SIZE = 50;

export function defaultVoucherEntitySearchSession(
  target: VoucherEntitySearchTarget,
): VoucherEntitySearchSession {
  return {
    kindFilter:
      target === "staff"
        ? VoucherPartnerKindUi.EMPLOYEE
        : VOUCHER_PARTNER_DEFAULT_KIND,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    searchInput: "",
    committedQuery: "",
    selectedKey: null,
  };
}

// Stable defaults — avoids render loops when subscribing to getSession().
const STABLE_DEFAULT_SESSIONS: Record<
  VoucherEntitySearchTarget,
  VoucherEntitySearchSession
> = {
  partner: defaultVoucherEntitySearchSession("partner"),
  staff: defaultVoucherEntitySearchSession("staff"),
  debtCollection: defaultVoucherEntitySearchSession("debtCollection"),
};

export function buildVoucherEntitySearchCacheKey(
  target: VoucherEntitySearchTarget,
  kind: VoucherPartnerKindUi,
  query: string,
  page: number,
  pageSize: number,
): string {
  return `${target}\0${kind}\0${query}\0${pageSize}\0${page}`;
}

interface VoucherEntitySearchStore {
  pageCache: Map<string, VoucherEntitySearchCacheEntry>;
  sessions: Partial<Record<VoucherEntitySearchTarget, VoucherEntitySearchSession>>;

  getPageCache: (key: string) => VoucherEntitySearchCacheEntry | undefined;
  setPageCache: (key: string, entry: VoucherEntitySearchCacheEntry) => void;
  clearPageCacheForTarget: (target: VoucherEntitySearchTarget) => void;

  getSession: (target: VoucherEntitySearchTarget) => VoucherEntitySearchSession;
  patchSession: (
    target: VoucherEntitySearchTarget,
    patch: Partial<VoucherEntitySearchSession>,
  ) => void;
}

export const useVoucherEntitySearchStore = create<VoucherEntitySearchStore>(
  (set, get) => ({
    pageCache: new Map(),
    sessions: {},

    getPageCache: (key) => get().pageCache.get(key),

    setPageCache: (key, entry) => {
      get().pageCache.set(key, entry);
    },

    clearPageCacheForTarget: (target) => {
      const prefix = `${target}\0`;
      for (const key of get().pageCache.keys()) {
        if (key.startsWith(prefix)) get().pageCache.delete(key);
      }
    },

    getSession: (target) =>
      get().sessions[target] ?? STABLE_DEFAULT_SESSIONS[target],

    patchSession: (target, patch) =>
      set((state) => ({
        sessions: {
          ...state.sessions,
          [target]: {
            ...(state.sessions[target] ?? STABLE_DEFAULT_SESSIONS[target]),
            ...patch,
          },
        },
      })),
  }),
);
