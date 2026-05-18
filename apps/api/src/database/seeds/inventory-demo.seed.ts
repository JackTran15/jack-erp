/**
 * Comprehensive demo data for the warehouse / inventory backoffice flows.
 * Builds ON TOP of `inventory.seed.ts` (which provides org + admin user + role).
 *
 *   - 2 extra branches (HN, DN) in addition to the seed main HCM branch
 *   - 4 extra storages
 *   - ~12 extra locations (mix of SHELF / RACK / BIN / ZONE)
 *   - 4 extra categories
 *   - 5 extra providers (NCC, delivery partners)
 *   - ~15 extra items spanning categories
 *   - Stock balances with varied scenarios: high stock, low stock (below min),
 *     zero stock, multi-location for the same item
 *   - 3 thresholds (min/max) so "Below min" filter has results
 *   - 1 sample posted Goods Receipt (drives stock-in audit)
 *   - 1 sample Stock Take in DRAFT (ready to count)
 *   - 1 sample Transfer Order in DRAFT
 *
 * Idempotent — uses deterministic UUIDs and `ON CONFLICT DO NOTHING` everywhere.
 * Safe to re-run.
 *
 * Run: pnpm --filter @erp/api seed:demo
 *
 * Pre-req: `pnpm seed:inventory` must have run first (we depend on the seed
 * organization + admin user + main branch IDs).
 */
import { AppDataSource } from '../data-source';

const ORG_ID = '10000000-0000-4000-8000-000000000001';
const ADMIN_USER_ID = '30000000-0000-4000-8000-000000000001';
const MAIN_BRANCH_ID = '20000000-0000-4000-8000-000000000001';
const MAIN_STORAGE_ID = '50000000-0000-4000-8000-000000000001';
const MAIN_LOCATION_ID = '60000000-0000-4000-8000-000000000001';

/** Deterministic IDs for everything we create here. */
const D = {
  // Branches
  branchHN: '20000000-0000-4000-8000-000000000010',
  branchDN: '20000000-0000-4000-8000-000000000011',
  // Storages
  storageHCMTemp: '50000000-0000-4000-8000-000000000010',
  storageHN: '50000000-0000-4000-8000-000000000020',
  storageDN: '50000000-0000-4000-8000-000000000030',
  // Locations (HCM main)
  locHCMA01: '60000000-0000-4000-8000-000000000010',
  locHCMA02: '60000000-0000-4000-8000-000000000011',
  locHCMB01: '60000000-0000-4000-8000-000000000012',
  locHCMC01: '60000000-0000-4000-8000-000000000013',
  // Locations (HCM temp)
  locHCMTempT01: '60000000-0000-4000-8000-000000000020',
  locHCMTempT02: '60000000-0000-4000-8000-000000000021',
  // Locations (HN)
  locHNA01: '60000000-0000-4000-8000-000000000030',
  locHNB01: '60000000-0000-4000-8000-000000000031',
  // Locations (DN)
  locDNA01: '60000000-0000-4000-8000-000000000040',
  locDNB01: '60000000-0000-4000-8000-000000000041',
  // Categories (in addition to existing Hardware + Giày dép)
  catApparel: '2d233c45-8ec6-42cf-8a84-df519fced601',
  catAccessory: '2d233c45-8ec6-42cf-8a84-df519fced602',
  catBag: '2d233c45-8ec6-42cf-8a84-df519fced603',
  catFood: '2d233c45-8ec6-42cf-8a84-df519fced604',
  // Providers (in addition to existing Default Supplier)
  providerABC: '65000000-0000-4000-8000-000000000010',
  providerXYZ: '65000000-0000-4000-8000-000000000011',
  providerPhuCuong: '65000000-0000-4000-8000-000000000012',
  providerGHN: '65000000-0000-4000-8000-000000000020',
  providerGHTK: '65000000-0000-4000-8000-000000000021',
  // Items
  itemKeyboard: '70000000-0000-4000-8000-000000000010',
  itemMouse: '70000000-0000-4000-8000-000000000011',
  itemWebcam: '70000000-0000-4000-8000-000000000012',
  itemHeadset: '70000000-0000-4000-8000-000000000013',
  itemRaincoat: '70000000-0000-4000-8000-000000000020',
  itemThermo: '70000000-0000-4000-8000-000000000021',
  itemBelt140: '70000000-0000-4000-8000-000000000022',
  itemBelt1850: '70000000-0000-4000-8000-000000000023',
  itemTshirtM: '70000000-0000-4000-8000-000000000030',
  itemTshirtL: '70000000-0000-4000-8000-000000000031',
  itemPants32: '70000000-0000-4000-8000-000000000032',
  itemBackpack: '70000000-0000-4000-8000-000000000040',
  itemHandbag: '70000000-0000-4000-8000-000000000041',
  itemNoodle: '70000000-0000-4000-8000-000000000050',
  itemWater: '70000000-0000-4000-8000-000000000051',
  // Sample documents
  goodsReceipt1: '90000000-0000-4000-8000-000000000001',
  stockTake1: '90000000-0000-4000-8000-000000000010',
  transferOrder1: '90000000-0000-4000-8000-000000000020',
};

interface ItemSeed {
  id: string;
  code: string;
  name: string;
  unit: string;
  /** Logical key — resolved to real categoryId at runtime via lookup map. */
  categoryKey: 'hardware' | 'apparel' | 'accessory' | 'bag' | 'food';
  purchasePrice: number;
  sellingPrice: number;
}

const ITEMS: ItemSeed[] = [
  { id: D.itemKeyboard, code: 'KEYB-MECH', name: 'Bàn phím cơ Akko', unit: 'cái', categoryKey: 'hardware', purchasePrice: 1_200_000, sellingPrice: 1_650_000 },
  { id: D.itemMouse, code: 'MOUSE-WL', name: 'Chuột không dây Logitech M331', unit: 'cái', categoryKey: 'hardware', purchasePrice: 380_000, sellingPrice: 520_000 },
  { id: D.itemWebcam, code: 'WEBCAM-HD', name: 'Webcam HD 1080p', unit: 'cái', categoryKey: 'hardware', purchasePrice: 750_000, sellingPrice: 990_000 },
  { id: D.itemHeadset, code: 'HEADSET-USB', name: 'Tai nghe USB Microsoft LX-6000', unit: 'cái', categoryKey: 'hardware', purchasePrice: 850_000, sellingPrice: 1_150_000 },
  { id: D.itemRaincoat, code: 'AOM-MT', name: 'Áo mưa MT', unit: 'cái', categoryKey: 'apparel', purchasePrice: 85_000, sellingPrice: 145_000 },
  { id: D.itemTshirtM, code: 'TSHIRT-M', name: 'Áo thun MT size M', unit: 'cái', categoryKey: 'apparel', purchasePrice: 110_000, sellingPrice: 199_000 },
  { id: D.itemTshirtL, code: 'TSHIRT-L', name: 'Áo thun MT size L', unit: 'cái', categoryKey: 'apparel', purchasePrice: 110_000, sellingPrice: 199_000 },
  { id: D.itemPants32, code: 'PANTS-32', name: 'Quần jeans MT size 32', unit: 'cái', categoryKey: 'apparel', purchasePrice: 280_000, sellingPrice: 459_000 },
  { id: D.itemThermo, code: 'BGN-500', name: 'Bình giữ nhiệt 500ml MT', unit: 'cái', categoryKey: 'accessory', purchasePrice: 95_000, sellingPrice: 169_000 },
  { id: D.itemBelt140, code: 'DD140', name: 'Dây thắt lưng da DD140', unit: 'cái', categoryKey: 'accessory', purchasePrice: 120_000, sellingPrice: 219_000 },
  { id: D.itemBelt1850, code: 'DD1850', name: 'Dây thắt lưng cao cấp DD1850', unit: 'cái', categoryKey: 'accessory', purchasePrice: 290_000, sellingPrice: 489_000 },
  { id: D.itemBackpack, code: 'BPK-001', name: 'Ba lô MT đa năng', unit: 'cái', categoryKey: 'bag', purchasePrice: 320_000, sellingPrice: 549_000 },
  { id: D.itemHandbag, code: 'TX-001', name: 'Túi xách tay MT da bò', unit: 'cái', categoryKey: 'bag', purchasePrice: 850_000, sellingPrice: 1_390_000 },
  { id: D.itemNoodle, code: 'NOODLE-01', name: 'Mì gói Hảo Hảo', unit: 'gói', categoryKey: 'food', purchasePrice: 3_500, sellingPrice: 5_000 },
  { id: D.itemWater, code: 'WATER-500', name: 'Nước suối 500ml', unit: 'chai', categoryKey: 'food', purchasePrice: 4_000, sellingPrice: 7_000 },
];

interface BalanceSeed {
  itemId: string;
  branchId: string;
  locationId: string;
  quantity: number;
}

/** Stock balances giving a healthy mix of high/low/zero/multi-location. */
const BALANCES: BalanceSeed[] = [
  // Hardware — Main Rack HCM has the bulk
  { itemId: D.itemKeyboard, branchId: MAIN_BRANCH_ID, locationId: MAIN_LOCATION_ID, quantity: 25 },
  { itemId: D.itemKeyboard, branchId: MAIN_BRANCH_ID, locationId: D.locHCMA01, quantity: 8 },
  { itemId: D.itemMouse, branchId: MAIN_BRANCH_ID, locationId: MAIN_LOCATION_ID, quantity: 47 },
  { itemId: D.itemMouse, branchId: MAIN_BRANCH_ID, locationId: D.locHCMA02, quantity: 12 },
  { itemId: D.itemMouse, branchId: D.branchHN, locationId: D.locHNA01, quantity: 18 },
  { itemId: D.itemWebcam, branchId: MAIN_BRANCH_ID, locationId: MAIN_LOCATION_ID, quantity: 2 }, // BELOW MIN
  { itemId: D.itemHeadset, branchId: MAIN_BRANCH_ID, locationId: D.locHCMA01, quantity: 15 },
  { itemId: D.itemHeadset, branchId: D.branchDN, locationId: D.locDNA01, quantity: 6 },
  // Apparel
  { itemId: D.itemRaincoat, branchId: MAIN_BRANCH_ID, locationId: D.locHCMB01, quantity: 120 },
  { itemId: D.itemTshirtM, branchId: MAIN_BRANCH_ID, locationId: D.locHCMB01, quantity: 45 },
  { itemId: D.itemTshirtM, branchId: D.branchHN, locationId: D.locHNB01, quantity: 30 },
  { itemId: D.itemTshirtL, branchId: MAIN_BRANCH_ID, locationId: D.locHCMB01, quantity: 38 },
  { itemId: D.itemTshirtL, branchId: D.branchHN, locationId: D.locHNB01, quantity: 0 }, // ZERO
  { itemId: D.itemPants32, branchId: MAIN_BRANCH_ID, locationId: D.locHCMB01, quantity: 22 },
  // Accessories
  { itemId: D.itemThermo, branchId: MAIN_BRANCH_ID, locationId: D.locHCMC01, quantity: 80 },
  { itemId: D.itemThermo, branchId: D.branchDN, locationId: D.locDNB01, quantity: 25 },
  { itemId: D.itemBelt140, branchId: MAIN_BRANCH_ID, locationId: D.locHCMC01, quantity: 5 }, // BELOW MIN
  { itemId: D.itemBelt1850, branchId: MAIN_BRANCH_ID, locationId: D.locHCMC01, quantity: 17 },
  // Bag
  { itemId: D.itemBackpack, branchId: MAIN_BRANCH_ID, locationId: D.locHCMB01, quantity: 14 },
  { itemId: D.itemBackpack, branchId: D.branchHN, locationId: D.locHNA01, quantity: 8 },
  { itemId: D.itemHandbag, branchId: MAIN_BRANCH_ID, locationId: D.locHCMA02, quantity: 3 },
  // Food — high turnover items
  { itemId: D.itemNoodle, branchId: MAIN_BRANCH_ID, locationId: D.locHCMTempT01, quantity: 500 },
  { itemId: D.itemNoodle, branchId: D.branchHN, locationId: D.locHNA01, quantity: 320 },
  { itemId: D.itemNoodle, branchId: D.branchDN, locationId: D.locDNA01, quantity: 180 },
  { itemId: D.itemWater, branchId: MAIN_BRANCH_ID, locationId: D.locHCMTempT01, quantity: 250 },
  { itemId: D.itemWater, branchId: D.branchDN, locationId: D.locDNA01, quantity: 50 }, // BELOW MIN
];

interface ThresholdSeed {
  itemId: string;
  locationId: string;
  minQty: number;
  maxQty?: number;
}

const THRESHOLDS: ThresholdSeed[] = [
  { itemId: D.itemWebcam, locationId: MAIN_LOCATION_ID, minQty: 5, maxQty: 50 },
  { itemId: D.itemBelt140, locationId: D.locHCMC01, minQty: 10, maxQty: 100 },
  { itemId: D.itemWater, locationId: D.locDNA01, minQty: 100, maxQty: 500 },
  { itemId: D.itemNoodle, locationId: MAIN_LOCATION_ID, minQty: 100, maxQty: 1000 },
  { itemId: D.itemRaincoat, locationId: D.locHCMB01, minQty: 20, maxQty: 300 },
];

async function seedDemo() {
  await AppDataSource.initialize();

  try {
    // ─── 1. Extra branches ──────────────────────────────────────────
    console.log('Seeding extra branches…');
    await AppDataSource.query(
      `
      INSERT INTO branches (id, organization_id, name, address, phone, status, is_main_branch, created_by, created_at, updated_at)
      VALUES
        ($1, $3, 'Chi nhánh Hà Nội',  '123 Nguyễn Trãi, Thanh Xuân, Hà Nội', '02438000000', 'ACTIVE', false, $4, NOW(), NOW()),
        ($2, $3, 'Chi nhánh Đà Nẵng', '45 Trần Phú, Hải Châu, Đà Nẵng',      '02363000000', 'ACTIVE', false, $4, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [D.branchHN, D.branchDN, ORG_ID, ADMIN_USER_ID],
    );

    // ─── 2. Storages ────────────────────────────────────────────────
    console.log('Seeding extra storages…');
    await AppDataSource.query(
      `
      INSERT INTO storages (id, organization_id, branch_id, name, is_main_storage, created_by, created_at, updated_at)
      VALUES
        ($1, $4, $5, 'Kho tạm HCM',   false, $6, NOW(), NOW()),
        ($2, $4, $7, 'Kho chính HN',  true,  $6, NOW(), NOW()),
        ($3, $4, $8, 'Kho chính DN',  true,  $6, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        D.storageHCMTemp, D.storageHN, D.storageDN,
        ORG_ID, MAIN_BRANCH_ID, ADMIN_USER_ID, D.branchHN, D.branchDN,
      ],
    );

    // ─── 3. Locations ───────────────────────────────────────────────
    console.log('Seeding locations…');
    const locations: Array<[string, string, string, string, string, 'SHELF' | 'RACK' | 'BIN' | 'ZONE']> = [
      // [id, branchId, storageId, code, name, type]
      [D.locHCMA01, MAIN_BRANCH_ID, MAIN_STORAGE_ID, 'HCM-A-01', 'Kệ A-01', 'RACK'],
      [D.locHCMA02, MAIN_BRANCH_ID, MAIN_STORAGE_ID, 'HCM-A-02', 'Kệ A-02', 'RACK'],
      [D.locHCMB01, MAIN_BRANCH_ID, MAIN_STORAGE_ID, 'HCM-B-01', 'Kệ B-01 quần áo', 'SHELF'],
      [D.locHCMC01, MAIN_BRANCH_ID, MAIN_STORAGE_ID, 'HCM-C-01', 'Kệ C-01 phụ kiện', 'SHELF'],
      [D.locHCMTempT01, MAIN_BRANCH_ID, D.storageHCMTemp, 'HCM-T-01', 'Khu nước & mì', 'ZONE'],
      [D.locHCMTempT02, MAIN_BRANCH_ID, D.storageHCMTemp, 'HCM-T-02', 'Khu chờ xuất', 'ZONE'],
      [D.locHNA01, D.branchHN, D.storageHN, 'HN-A-01', 'Kệ A-01 HN', 'RACK'],
      [D.locHNB01, D.branchHN, D.storageHN, 'HN-B-01', 'Kệ B-01 HN', 'SHELF'],
      [D.locDNA01, D.branchDN, D.storageDN, 'DN-A-01', 'Kệ A-01 DN', 'RACK'],
      [D.locDNB01, D.branchDN, D.storageDN, 'DN-B-01', 'Kệ B-01 DN', 'SHELF'],
    ];
    for (const [id, branchId, storageId, code, name, type] of locations) {
      await AppDataSource.query(
        `
        INSERT INTO locations (id, organization_id, branch_id, storage_id, code, name, type, is_active, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7::locations_type_enum, true, $8, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
        `,
        [id, ORG_ID, branchId, storageId, code, name, type, ADMIN_USER_ID],
      );
    }

    // ─── 4. Categories ──────────────────────────────────────────────
    // The table has UNIQUE (organization_id, name) — older seeds + the
    // ItemManagementPhase1 data migration may already have created categories
    // with different UUIDs. So we INSERT-IGNORE by name then resolve the real
    // ID by name lookup before using it on items.
    console.log('Seeding categories…');
    const categories: Array<[string, string]> = [
      [D.catApparel, 'Quần áo'],
      [D.catAccessory, 'Phụ kiện'],
      [D.catBag, 'Túi xách'],
      [D.catFood, 'Thực phẩm'],
    ];
    for (const [id, name] of categories) {
      await AppDataSource.query(
        `
        INSERT INTO inventory_item_categories (id, organization_id, name, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (organization_id, name) DO NOTHING
        `,
        [id, ORG_ID, name, ADMIN_USER_ID],
      );
    }
    // Build name → id map (handles pre-existing rows from data migration).
    const categoryRows = await AppDataSource.query(
      `SELECT id, name FROM inventory_item_categories WHERE organization_id = $1`,
      [ORG_ID],
    ) as Array<{ id: string; name: string }>;
    const categoryIdByName = new Map(categoryRows.map((r) => [r.name, r.id]));
    const HARDWARE_CAT_ID =
      categoryIdByName.get('Phần cứng') ||
      categoryIdByName.get('Hardware') ||
      // Fallback to the static seed UUID from inventory.seed.ts (Hardware category).
      '2d233c45-8ec6-42cf-8a84-df519fced6c7';
    const APPAREL_CAT_ID = categoryIdByName.get('Quần áo')!;
    const ACCESSORY_CAT_ID = categoryIdByName.get('Phụ kiện')!;
    const BAG_CAT_ID = categoryIdByName.get('Túi xách')!;
    const FOOD_CAT_ID = categoryIdByName.get('Thực phẩm')!;

    // ─── 5. Providers (suppliers + delivery partners) ───────────────
    console.log('Seeding providers…');
    const providers: Array<[string, string, string, string]> = [
      [D.providerABC, 'NCC-ABC', 'Công ty TNHH ABC (giày dép)', '0901111111'],
      [D.providerXYZ, 'NCC-XYZ', 'Công ty XYZ (phụ kiện)', '0902222222'],
      [D.providerPhuCuong, 'NCC-PC', 'Công ty Phú Cường (quần áo)', '0903333333'],
      [D.providerGHN, 'DTGH-GHN', 'Giao hàng nhanh (GHN)', '1900636677'],
      [D.providerGHTK, 'DTGH-GHTK', 'Giao hàng tiết kiệm (GHTK)', '19000000'],
    ];
    for (const [id, code, name, phone] of providers) {
      await AppDataSource.query(
        `
        INSERT INTO inventory_providers (id, organization_id, code, name, phone, is_active, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, true, $6, NOW(), NOW())
        ON CONFLICT (organization_id, code) DO NOTHING
        `,
        [id, ORG_ID, code, name, phone, ADMIN_USER_ID],
      );
    }

    // ─── 6. Items ───────────────────────────────────────────────────
    console.log(`Seeding ${ITEMS.length} items…`);
    const categoryKeyToId: Record<ItemSeed['categoryKey'], string> = {
      hardware: HARDWARE_CAT_ID,
      apparel: APPAREL_CAT_ID,
      accessory: ACCESSORY_CAT_ID,
      bag: BAG_CAT_ID,
      food: FOOD_CAT_ID,
    };
    for (const it of ITEMS) {
      await AppDataSource.query(
        `
        INSERT INTO items
          (id, organization_id, branch_id, code, name, unit, category_id,
           is_active, is_pos_visible, purchase_price, selling_price,
           is_gold_silver, manage_barcode_per_unit,
           created_by, created_at, updated_at)
        VALUES ($1, $2, NULL, $3, $4, $5, $6, true, true, $7, $8, false, false, $9, NOW(), NOW())
        ON CONFLICT (organization_id, code) DO NOTHING
        `,
        [it.id, ORG_ID, it.code, it.name, it.unit, categoryKeyToId[it.categoryKey],
         it.purchasePrice, it.sellingPrice, ADMIN_USER_ID],
      );
    }

    // ─── 7. Link items ↔ primary provider (best-effort) ─────────────
    console.log('Linking items ↔ providers…');
    const itemProviderLinks: Array<[string, string]> = [
      [D.itemKeyboard, D.providerXYZ],
      [D.itemMouse, D.providerXYZ],
      [D.itemWebcam, D.providerXYZ],
      [D.itemHeadset, D.providerXYZ],
      [D.itemRaincoat, D.providerPhuCuong],
      [D.itemTshirtM, D.providerPhuCuong],
      [D.itemTshirtL, D.providerPhuCuong],
      [D.itemPants32, D.providerPhuCuong],
      [D.itemThermo, D.providerABC],
      [D.itemBelt140, D.providerABC],
      [D.itemBelt1850, D.providerABC],
      [D.itemBackpack, D.providerABC],
      [D.itemHandbag, D.providerABC],
    ];
    for (const [itemId, providerId] of itemProviderLinks) {
      // Insert as non-primary to avoid violating the partial unique index
      // "UQ_item_providers_primary" (one is_primary=true per item). Items
      // seeded by inventory.seed.ts already have a primary supplier.
      await AppDataSource.query(
        `
        INSERT INTO item_providers (organization_id, item_id, provider_id, is_primary, created_by)
        VALUES ($1, $2, $3, false, $4)
        ON CONFLICT (item_id, provider_id) DO NOTHING
        `,
        [ORG_ID, itemId, providerId, ADMIN_USER_ID],
      );
    }

    // ─── 8. Stock balances ──────────────────────────────────────────
    console.log(`Seeding ${BALANCES.length} stock balances…`);
    for (const b of BALANCES) {
      await AppDataSource.query(
        `
        INSERT INTO stock_balances (organization_id, branch_id, item_id, location_id, quantity, last_movement_at, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW(), NOW())
        ON CONFLICT (organization_id, item_id, location_id) DO UPDATE SET quantity = EXCLUDED.quantity
        `,
        [ORG_ID, b.branchId, b.itemId, b.locationId, b.quantity, ADMIN_USER_ID],
      );
    }

    // ─── 9. Stock thresholds ────────────────────────────────────────
    console.log(`Seeding ${THRESHOLDS.length} thresholds…`);
    for (const t of THRESHOLDS) {
      await AppDataSource.query(
        `
        INSERT INTO item_stock_thresholds (organization_id, item_id, location_id, min_qty, max_qty, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (item_id, location_id) DO UPDATE
          SET min_qty = EXCLUDED.min_qty, max_qty = EXCLUDED.max_qty
        `,
        [ORG_ID, t.itemId, t.locationId, t.minQty, t.maxQty ?? null, ADMIN_USER_ID],
      );
    }

    // ─── 10. Sample Goods Receipt (POSTED) ──────────────────────────
    console.log('Seeding sample Goods Receipt…');
    await AppDataSource.query(
      `
      INSERT INTO goods_receipts
        (id, organization_id, branch_id, document_number, status, purpose,
         provider_id, delivered_by, reason, description, source_branch_id,
         received_at, location_id, attachment_ids,
         posted_at, posted_by, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, 'NK-SEED-001', 'POSTED'::goods_receipt_status_enum,
              'OTHER'::goods_receipt_purpose_enum, $4, 'Anh Tài', 'Nhập hàng đầu kỳ',
              'Phiếu mẫu seed', NULL, NOW() - INTERVAL '5 days', $5, '[]'::jsonb,
              NOW() - INTERVAL '5 days', $6::uuid, $6, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [D.goodsReceipt1, ORG_ID, MAIN_BRANCH_ID, D.providerXYZ, MAIN_LOCATION_ID, ADMIN_USER_ID],
    );
    // 2 lines
    await AppDataSource.query(
      `
      INSERT INTO goods_receipt_lines
        (id, organization_id, branch_id, goods_receipt_id, item_id, location_id,
         uom_code, quantity, unit_price, line_total, note, created_by, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), $1, $2, $3, $4, $5, 'cái', 10, 380000, 3800000, NULL, $6, NOW(), NOW()),
        (uuid_generate_v4(), $1, $2, $3, $7, $5, 'cái', 5,  850000, 4250000, NULL, $6, NOW(), NOW())
      ON CONFLICT DO NOTHING
      `,
      [ORG_ID, MAIN_BRANCH_ID, D.goodsReceipt1, D.itemMouse, MAIN_LOCATION_ID, ADMIN_USER_ID, D.itemHeadset],
    );

    // ─── 11. Sample Stock Take (DRAFT — ready to count) ─────────────
    console.log('Seeding sample Stock Take…');
    await AppDataSource.query(
      `
      INSERT INTO stock_takes
        (id, organization_id, branch_id, document_number, status, storage_id,
         snapshot_at, notes, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, NULL, 'DRAFT'::stock_take_status_enum, $4,
              NOW(), 'Phiếu kiểm kê mẫu — vào để đếm', $5, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [D.stockTake1, ORG_ID, MAIN_BRANCH_ID, MAIN_STORAGE_ID, ADMIN_USER_ID],
    );
    // Snapshot all stock_balances trong main storage into stock_take_lines
    await AppDataSource.query(
      `
      INSERT INTO stock_take_lines
        (id, organization_id, branch_id, stock_take_id, item_id, location_id,
         expected_qty, counted_qty, note, created_by, created_at, updated_at)
      SELECT uuid_generate_v4(), sb.organization_id, sb.branch_id, $1,
             sb.item_id, sb.location_id, sb.quantity, NULL, NULL, $2, NOW(), NOW()
      FROM stock_balances sb
      INNER JOIN locations loc ON loc.id = sb.location_id
      WHERE sb.organization_id = $3
        AND loc.storage_id = $4
        AND NOT EXISTS (
          SELECT 1 FROM stock_take_lines stl
          WHERE stl.stock_take_id = $1 AND stl.item_id = sb.item_id AND stl.location_id = sb.location_id
        )
      `,
      [D.stockTake1, ADMIN_USER_ID, ORG_ID, MAIN_STORAGE_ID],
    );

    // ─── 12. Sample Transfer Order (DRAFT) ──────────────────────────
    console.log('Seeding sample Transfer Order…');
    await AppDataSource.query(
      `
      INSERT INTO transfer_orders
        (id, organization_id, branch_id, document_number, status,
         source_branch_id, destination_branch_id,
         source_storage_id, destination_storage_id,
         requested_date, notes, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, NULL, 'DRAFT'::transfer_order_status_enum,
              $3, $4, $5, $6, CURRENT_DATE + INTERVAL '3 days',
              'Yêu cầu điều chuyển hàng từ HCM ra HN', $7, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [D.transferOrder1, ORG_ID, MAIN_BRANCH_ID, D.branchHN, MAIN_STORAGE_ID, D.storageHN, ADMIN_USER_ID],
    );
    await AppDataSource.query(
      `
      INSERT INTO transfer_order_lines
        (id, organization_id, branch_id, transfer_order_id, item_id, requested_qty, note, created_by, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), $1, $2, $3, $4, 20, NULL, $5, NOW(), NOW()),
        (uuid_generate_v4(), $1, $2, $3, $6, 10, NULL, $5, NOW(), NOW())
      ON CONFLICT DO NOTHING
      `,
      [ORG_ID, MAIN_BRANCH_ID, D.transferOrder1, D.itemMouse, ADMIN_USER_ID, D.itemHeadset],
    );

    console.log('\n✅ Demo inventory seed completed.\n');
    console.log('Summary:');
    console.log('  • 3 branches: HCM (main), Hà Nội, Đà Nẵng');
    console.log('  • 4 storages: Kho chính HCM, Kho tạm HCM, Kho chính HN, Kho chính DN');
    console.log('  • 10 locations (RACK/SHELF/ZONE mix)');
    console.log('  • 5 categories (existing Hardware + Giày dép + 4 new)');
    console.log('  • 6 providers (Default Supplier + 5 mới)');
    console.log(`  • ${ITEMS.length} items spanning categories`);
    console.log(`  • ${BALANCES.length} stock balances (incl. below-min, zero)`);
    console.log(`  • ${THRESHOLDS.length} thresholds`);
    console.log('  • Sample: Goods Receipt NK000001 (POSTED)');
    console.log('  • Sample: Stock Take (DRAFT — vào để đếm)');
    console.log('  • Sample: Transfer Order (DRAFT — HCM → HN)');
  } catch (err) {
    console.error('Demo seed failed:', err);
    process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

void seedDemo();
