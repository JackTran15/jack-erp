/**
 * Mock data shared by the four storage reports.
 * shapes so each page can derive its rows from a single source. Replace with
 * real API calls when the backend report endpoints are ready.
 */

export interface MockStockSku {
  sku: string;
  name: string;
  unit: string;
  group: string;
  parentSku: string;
  parentName: string;
  brand: string;
  color: string;
  size: string;
  imageUrl: string;
  positionCode: string;
  positionName: string;
  warehouse: string;
  warehouseCode: string;
  branch: string;
  branchCode: string;
  supplier: string;
  /** Tồn đầu kỳ */
  openingQty: number;
  openingValue: number;
  /** Nhập trong kỳ */
  inQty: number;
  inValue: number;
  /** Xuất trong kỳ */
  outQty: number;
  outValue: number;
  /** Đang chuyển đi */
  transferOutQty: number;
  transferOutValue: number;
  /** Sắp nhận về */
  incomingQty: number;
  incomingValue: number;
}

const GROUPS = ["Giày nam", "Giày nữ", "Sandal nữ", "Dép nữ", "Dép nam"];
const WAREHOUSES = [
  { code: "MTCANTHO", name: "SHOWROOM CẦN THƠ", branchCode: "CT", branch: "Giày MT Cần Thơ" },
  { code: "MTDANANG", name: "SHOWROOM ĐÀ NẴNG", branchCode: "DN", branch: "Giày MT Đà Nẵng" },
];
const PARENTS = [
  "ABA2950", "ABA3026", "ABA3299", "AKCV19837", "CTH64982", "MY3007", "MY63652", "DUG02030",
  "PGIA222", "SAN822",
];
const SUFFIXES = ["BO-42", "BO-43", "BO-44", "D-38", "D-39", "D-40", "D-41", "D-42", "D-43", "N-38", "N-39", "N-40", "N-41", "N-42"];

function pseudoRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const COLORS = ["Đen", "Nâu", "Trắng", "Đỏ"];
const COLOR_CODES: Record<string, string> = { "BO-": "Nâu", "D-": "Đen", "N-": "Nâu" };
const SUPPLIERS = ["NCC Mặc Định", "Giày Việt", "Lasta"];

function suffixToColorSize(suffix: string): { color: string; size: string } {
  const parts = suffix.split("-");
  const code = parts.length > 1 ? `${parts[0]}-` : "";
  const size = parts.length > 1 ? parts[1]! : "";
  const color = COLOR_CODES[code] ?? COLORS[0]!;
  return { color, size };
}

export function generateMockStock(): MockStockSku[] {
  const rand = pseudoRand(42);
  const rows: MockStockSku[] = [];
  for (const parent of PARENTS) {
    const group = GROUPS[Math.floor(rand() * GROUPS.length)]!;
    for (const suffix of SUFFIXES) {
      for (const wh of WAREHOUSES) {
        const sku = `${parent}-${suffix}`;
        const { color, size } = suffixToColorSize(suffix);
        const openingQty = Math.floor(rand() * 5);
        const inQty = rand() < 0.15 ? Math.floor(rand() * 8) : 0;
        const outQty = rand() < 0.18 ? Math.min(openingQty + inQty, Math.floor(rand() * 3) + 1) : 0;
        const unitPrice = 340_000;
        const transferOutQty = rand() < 0.05 ? 1 : 0;
        const incomingQty = rand() < 0.04 ? 1 : 0;
        const positionCode = `T${String(Math.floor(rand() * 30)).padStart(2, "0")}.${String(Math.floor(rand() * 10)).padStart(2, "0")}`;
        rows.push({
          sku,
          name: `${group} ${sku}`,
          unit: "Đôi",
          group,
          parentSku: parent,
          parentName: parent,
          brand: "Giày MT",
          color,
          size,
          imageUrl: "",
          positionCode,
          positionName: positionCode,
          warehouse: wh.name,
          warehouseCode: wh.code,
          branch: wh.branch,
          branchCode: wh.branchCode,
          supplier: SUPPLIERS[Math.floor(rand() * SUPPLIERS.length)]!,
          openingQty,
          openingValue: openingQty * unitPrice,
          inQty,
          inValue: inQty * unitPrice,
          outQty,
          outValue: outQty * unitPrice,
          transferOutQty,
          transferOutValue: transferOutQty * unitPrice,
          incomingQty,
          incomingValue: incomingQty * unitPrice,
        });
      }
    }
  }
  return rows;
}

export interface MockStockDocLine {
  date: string; // dd/MM/yyyy
  isoDate: string; // yyyy-MM-dd for date filter
  documentType: string;
  warehouse: string;
  documentNumber: string;
  reference: string;
  sku: string;
  name: string;
  unit: string;
  group: string;
  parentSku: string;
  parentName: string;
  color: string;
  size: string;
  notes: string;
  inQty: number;
  inUnitPrice: number;
  inValue: number;
  inSalePrice: number;
  outQty: number;
  outUnitPrice: number;
  outValue: number;
  outSalePrice: number;
  customer: string;
  branchCode: string;
  branchName: string;
  receiverBranchCode: string;
  receiverBranchName: string;
}

const CUSTOMERS = ["Phan Thanh Hà", "Anh Hà", "duc anh", "Khách lẻ"];

export function generateMockStockDocs(): MockStockDocLine[] {
  const rand = pseudoRand(7);
  const rows: MockStockDocLine[] = [];
  const dateOptions: { d: string; iso: string }[] = [
    { d: "05/05/2026", iso: "2026-05-05" },
    { d: "06/05/2026", iso: "2026-05-06" },
    { d: "07/05/2026", iso: "2026-05-07" },
    { d: "08/05/2026", iso: "2026-05-08" },
    { d: "09/05/2026", iso: "2026-05-09" },
  ];
  let docNum = 4;
  for (let i = 0; i < 80; i++) {
    const wh = WAREHOUSES[Math.floor(rand() * WAREHOUSES.length)]!;
    const parent = PARENTS[Math.floor(rand() * PARENTS.length)]!;
    const suffix = SUFFIXES[Math.floor(rand() * SUFFIXES.length)]!;
    const sku = `${parent}-${suffix}`;
    const { color, size } = suffixToColorSize(suffix);
    const group = GROUPS[Math.floor(rand() * GROUPS.length)]!;
    const isIn = rand() < 0.3;
    const docType = isIn ? "Phiếu nhập kho mua hàng" : "Phiếu xuất kho bán hàng";
    const inQty = isIn ? Math.floor(rand() * 3) + 1 : 0;
    const outQty = isIn ? 0 : Math.floor(rand() * 2) + 1;
    const inUnitPrice = isIn ? 340_000 : 0;
    const outUnitPrice = isIn ? 0 : 340_000;
    const dt = dateOptions[Math.floor(rand() * dateOptions.length)]!;
    rows.push({
      date: dt.d,
      isoDate: dt.iso,
      documentType: docType,
      warehouse: wh.name,
      documentNumber: `${isIn ? "NK" : "XK"}${String(docNum++).padStart(6, "0")}`,
      reference: `260501${String(1000 + i).slice(-4)}`,
      sku,
      name: `${group} ${sku}`,
      unit: "Đôi",
      group,
      parentSku: parent,
      parentName: parent,
      color,
      size,
      notes: "",
      inQty,
      inUnitPrice,
      inValue: inQty * inUnitPrice,
      inSalePrice: isIn ? 540_000 : 0,
      outQty,
      outUnitPrice,
      outValue: outQty * outUnitPrice,
      outSalePrice: isIn ? 0 : 540_000,
      customer: CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)]!,
      branchCode: wh.branchCode,
      branchName: wh.branch,
      receiverBranchCode: "",
      receiverBranchName: "",
    });
  }
  return rows;
}
