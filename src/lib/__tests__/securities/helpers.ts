import {
  computeSecuritiesLots,
  type SecuritiesTransaction,
  type SecuritiesLotData,
} from "../../securities-lot-engine";

let _id = 1;

/** UTC date for stable, timezone-independent test dates. */
export const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** Build a SecuritiesTransaction (engine input) with sensible defaults. */
export function tx(
  o: Partial<SecuritiesTransaction> & { type: string; symbol: string; date: Date },
): SecuritiesTransaction {
  return {
    id: _id++,
    userId: "u1",
    brokerageId: null,
    assetClass: "STOCK",
    quantity: 0,
    price: 0,
    fees: 0,
    totalAmount: null,
    isCovered: true,
    isSection1256: false,
    ...o,
  };
}

/** Run the lot engine on a transaction list (no DB). */
export function runLots(
  txns: SecuritiesTransaction[],
  method = "FIFO",
  accountType = "TAXABLE",
) {
  // method is a string union in the engine; tests pass plain strings.
  return computeSecuritiesLots(txns, method as never, accountType);
}

export const openLots = (lots: SecuritiesLotData[]) =>
  lots.filter((l) => l.status === "OPEN");

export const lotByAcq = (lots: SecuritiesLotData[], iso: string) =>
  lots.find(
    (l) => l.status === "OPEN" && l.dateAcquired.getTime() === d(iso).getTime(),
  );
