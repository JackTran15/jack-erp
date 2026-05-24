import { useCallback, useState } from "react";
import { buildCashCountSeedRows } from "./mock-cash-count";
import {
  CashCountStatusEnum,
  type CashCountRecord,
} from "./cash-count.types";
import {
  computeTotals,
  emptyDenominationLines,
  emptyParticipant,
  mockBookBalanceForDate,
  nextKkqNumber,
  nowTimeHm,
  syncLineAmounts,
  todayIsoDate,
} from "./cash-count.utils";

function normalizeRecord(record: CashCountRecord): CashCountRecord {
  const lines = syncLineAmounts(record.lines);
  const bookBalance =
    record.bookBalance || mockBookBalanceForDate(record.inventoryUntilDate);
  const { actualAmount, variance } = computeTotals(lines, bookBalance);
  return {
    ...record,
    lines,
    bookBalance,
    actualAmount,
    variance,
  };
}

export function useCashCountMockStore() {
  const [records, setRecords] = useState<CashCountRecord[]>(() =>
    buildCashCountSeedRows().map(normalizeRecord),
  );

  const addRecord = useCallback(
    (partial: Omit<CashCountRecord, "id" | "documentNumber" | "status">) => {
      let created!: CashCountRecord;
      setRecords((prev) => {
        const documentNumber = nextKkqNumber(prev);
        const id = `kkq-${documentNumber.toLowerCase()}`;
        created = normalizeRecord({
          ...partial,
          id,
          documentNumber,
          status: CashCountStatusEnum.UNPROCESSED,
        });
        return [...prev, created];
      });
      return created;
    },
    [],
  );

  const updateRecord = useCallback((id: string, patch: Partial<CashCountRecord>) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return normalizeRecord({ ...r, ...patch });
      }),
    );
  }, []);

  const removeRecord = useCallback((id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const processRecord = useCallback((id: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: CashCountStatusEnum.PROCESSED }
          : r,
      ),
    );
  }, []);

  const reloadFromSeed = useCallback(() => {
    setRecords(buildCashCountSeedRows().map(normalizeRecord));
  }, []);

  const createDraftRecord = useCallback(
    (inventoryUntilDate: string): Omit<CashCountRecord, "id" | "documentNumber"> => {
      const bookBalance = mockBookBalanceForDate(inventoryUntilDate);
      const lines = emptyDenominationLines();
      const { actualAmount, variance } = computeTotals(lines, bookBalance);
      return {
        countDate: todayIsoDate(),
        inventoryUntilDate,
        countTime: nowTimeHm(),
        purpose: "",
        reference: "",
        status: CashCountStatusEnum.UNPROCESSED,
        lines,
        participants: [emptyParticipant()],
        bookBalance,
        actualAmount,
        variance,
        conclusion: "",
      };
    },
    [],
  );

  return {
    records,
    addRecord,
    updateRecord,
    removeRecord,
    processRecord,
    reloadFromSeed,
    createDraftRecord,
    getById: (id: string | null) =>
      id ? (records.find((r) => r.id === id) ?? null) : null,
  };
}
