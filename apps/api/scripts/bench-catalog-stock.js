/**
 * Before/after benchmark for the POS catalog list route's stock read.
 *
 * The list route used to sum branch stock by hydrating every `stock_balances` row for the branch
 * (plus every location behind them) into TypeORM entities. That is synchronous CPU on the single
 * Node thread, so it did not only make its own request slow — it delayed every other request in
 * flight. `loadListStockTotals` replaced it with one aggregate query.
 *
 * Both paths are measured in the same run, so the comparison is against this machine and this
 * database rather than against a number written down on another day. The old path is still in the
 * source (it serves the detail route), so it is measured directly, not reconstructed from memory.
 *
 *   AC-07  the list route's stock read, on a branch with ~14k balance rows
 *   AC-08  a one-row primary-key lookup fired alongside N concurrent list reads
 *
 * Usage:
 *   DB_NAME=erp_dev_3008 BENCH_ORG=<uuid> BENCH_BRANCH=<uuid> node apps/api/scripts/bench-catalog-stock.js
 *
 * Requires a build (`pnpm --filter @erp/api build`) — it drives the compiled data source so the
 * entity metadata and column mappings are the ones the API actually runs with. Credentials come
 * from the environment / apps/api/.env, never from this file.
 */
const path = require('node:path');
const { In } = require('typeorm');

const DIST = path.resolve(__dirname, '..', 'dist');
const { AppDataSource } = require(path.join(DIST, 'database', 'data-source.js'));
const { LocationEntity } = require(path.join(DIST, 'modules', 'inventory', 'location', 'location.entity.js'));

const ORG = process.env.BENCH_ORG;
const BRANCH = process.env.BENCH_BRANCH;
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY || 4);
const REPEATS = Number(process.env.BENCH_REPEATS || 5);

if (!ORG || !BRANCH) {
  console.error('set BENCH_ORG and BENCH_BRANCH to the organization and branch to measure');
  process.exit(2);
}

const ms = (start) => Number(process.hrtime.bigint() - start) / 1e6;

async function timed(fn, repeats = REPEATS) {
  let total = 0;
  let best = Infinity;
  for (let i = 0; i < repeats; i++) {
    const start = process.hrtime.bigint();
    await fn();
    const took = ms(start);
    total += took;
    best = Math.min(best, took);
  }
  return { avg: total / repeats, best };
}

/** The pre-change read: whole-branch balances and locations, hydrated as entities. */
async function oldPath(ds) {
  const balances = await ds.getRepository('StockBalanceEntity').find({
    where: { organizationId: ORG, branchId: BRANCH, isTracked: true },
  });
  const locationIds = [...new Set(balances.map((b) => b.locationId))];
  if (locationIds.length) {
    await ds.getRepository('LocationEntity').find({
      where: { id: In(locationIds), organizationId: ORG, isActive: true },
    });
  }
  await ds.getRepository('StorageEntity').find({ where: { organizationId: ORG, branchId: BRANCH } });
  return balances.length;
}

/** The current read: `loadListStockTotals`, no direction filter. */
async function newPath(ds) {
  const rows = await ds
    .getRepository('StockBalanceEntity')
    .createQueryBuilder('sb')
    .innerJoin(LocationEntity, 'l', 'l.id = sb.locationId AND l.organizationId = :orgId AND l.isActive = true')
    .select('sb.itemId', 'itemId')
    .addSelect('SUM(sb.quantity)', 'total')
    .where('sb.organizationId = :orgId')
    .andWhere('sb.branchId = :branchId')
    .andWhere('sb.isTracked = true')
    .groupBy('sb.itemId')
    .setParameters({ orgId: ORG, branchId: BRANCH })
    .getRawMany();
  return rows.length;
}

(async () => {
  await AppDataSource.initialize();
  const ds = AppDataSource;
  const orgRepo = ds.getRepository('OrganizationEntity');
  const findOne = () => orgRepo.findOne({ where: { id: ORG } });

  const rowCount = await oldPath(ds);
  await newPath(ds);
  await findOne();

  console.log(`database ${ds.options.database}  org ${ORG}  branch ${BRANCH}`);
  console.log(`${rowCount} tracked stock_balances rows in this branch\n`);

  const old = await timed(() => oldPath(ds));
  const now = await timed(() => newPath(ds));
  console.log('AC-07 — the list route\'s stock read');
  console.log(`  before (hydrate whole branch)   ${old.avg.toFixed(1).padStart(7)} ms avg  (best ${old.best.toFixed(1)})`);
  console.log(`  after  (one aggregate query)    ${now.avg.toFixed(1).padStart(7)} ms avg  (best ${now.best.toFixed(1)})`);

  // A neighbour fired into the same event loop. This is the number the production log was
  // actually showing: a 1-row lookup reported at ~875 ms because of what ran beside it.
  const neighbour = async (load) => {
    const results = await Promise.all([
      ...Array.from({ length: CONCURRENCY }, () => load(ds)),
      (async () => {
        const start = process.hrtime.bigint();
        await findOne();
        return ms(start);
      })(),
    ]);
    return results[results.length - 1];
  };

  const soloStart = process.hrtime.bigint();
  await findOne();
  const solo = ms(soloStart);

  const beforeNeighbour = await neighbour(oldPath);
  const afterNeighbour = await neighbour(newPath);
  console.log(`\nAC-08 — a 1-row primary-key lookup beside ${CONCURRENCY} concurrent list reads`);
  console.log(`  alone                           ${solo.toFixed(1).padStart(7)} ms`);
  console.log(`  before                          ${beforeNeighbour.toFixed(1).padStart(7)} ms`);
  console.log(`  after                           ${afterNeighbour.toFixed(1).padStart(7)} ms`);

  await ds.destroy();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
