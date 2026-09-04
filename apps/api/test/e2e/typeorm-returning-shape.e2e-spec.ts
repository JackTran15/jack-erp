import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  affectedRowCount,
  returnedRows,
} from '../../src/common/utils/returning-rows.util';
import { createTestApp } from './setup/test-app';

/**
 * Proves — against a live Postgres, through the app's own DataSource — what
 * `manager.query()` actually returns for each SQL command. Every caller of a
 * raw `… RETURNING` query rests on this, and getting it wrong is not
 * theoretical: `TransferOrderService.adjustRequestedQty` read `.length` off an
 * UPDATE result, which is always 2, and its insert branch was unreachable for
 * ten days while a mocked unit test reported green (ADR-01, ADR-02).
 *
 * A mock cannot establish this. Only the driver can, so this file asks it.
 *
 * Uses a session-local TEMP table: no business table is touched, and it
 * disappears with the connection. No resetDatabase() / seedBaseData() needed.
 */
describe('TypeORM query() result shapes (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    // TEMP tables are per-connection; pin one runner for the whole suite so the
    // table is still there on the next query.
    await ds.query(
      `CREATE TEMP TABLE IF NOT EXISTS returning_shape_probe (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         qty numeric NOT NULL
       )`,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await ds.query(`DELETE FROM returning_shape_probe`);
  });

  it('SELECT returns a plain row array', async () => {
    await ds.query(`INSERT INTO returning_shape_probe (qty) VALUES (1), (2)`);
    const result = await ds.query(`SELECT id FROM returning_shape_probe`);

    expect(Array.isArray(result[0])).toBe(false);
    expect(returnedRows(result)).toHaveLength(2);
    expect(affectedRowCount(result)).toBe(2);
  });

  it('INSERT … RETURNING returns a plain row array', async () => {
    const result = await ds.query(
      `INSERT INTO returning_shape_probe (qty) VALUES (5) RETURNING id`,
    );

    expect(Array.isArray(result[0])).toBe(false);
    expect(returnedRows(result)).toHaveLength(1);
  });

  it('UPDATE … RETURNING that matches nothing returns [[], 0] — length 2, not 0', async () => {
    const result = await ds.query(
      `UPDATE returning_shape_probe SET qty = qty + $1 WHERE qty = $2 RETURNING id`,
      [1, 999],
    );

    // This is the trap, stated as an assertion: the naive `.length > 0` check
    // that killed the 2026-08-24 transfer-order fix passes here.
    expect(result).toHaveLength(2);
    expect(result.length > 0).toBe(true);

    expect(returnedRows(result)).toEqual([]);
    expect(affectedRowCount(result)).toBe(0);
  });

  it('UPDATE … RETURNING that matches rows returns [rows, rowCount]', async () => {
    await ds.query(
      `INSERT INTO returning_shape_probe (qty) VALUES (5), (5), (7)`,
    );
    const result = await ds.query(
      `UPDATE returning_shape_probe SET qty = qty + $1 WHERE qty = $2 RETURNING id`,
      [1, 5],
    );

    expect(result).toHaveLength(2);
    expect(Array.isArray(result[0])).toBe(true);
    expect(returnedRows(result)).toHaveLength(2);
    expect(affectedRowCount(result)).toBe(2);
  });

  it('DELETE … RETURNING is wrapped the same way as UPDATE', async () => {
    await ds.query(`INSERT INTO returning_shape_probe (qty) VALUES (3)`);
    const result = await ds.query(
      `DELETE FROM returning_shape_probe WHERE qty = $1 RETURNING id`,
      [3],
    );

    expect(Array.isArray(result[0])).toBe(true);
    expect(affectedRowCount(result)).toBe(1);
  });
});
