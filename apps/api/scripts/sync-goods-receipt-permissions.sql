-- Idempotent: add goods_receipt.* permissions and grant to all roles
-- in the organization of the seed admin user.
--
-- Run with:
--   docker exec -i erp-postgres psql -U erp_user -d erp_dev \
--     < apps/api/scripts/sync-goods-receipt-permissions.sql

BEGIN;

INSERT INTO permissions (id, key, description, module) VALUES
  (gen_random_uuid(), 'goods_receipt.read',  'View goods receipts (phiếu nhập kho)', 'inventory'),
  (gen_random_uuid(), 'goods_receipt.write', 'Create/update/cancel goods receipts',  'inventory'),
  (gen_random_uuid(), 'goods_receipt.post',  'Post goods receipts (commit stock-in)','inventory')
ON CONFLICT (key) DO NOTHING;

-- Grant the 3 new permissions to every role in every organization.
-- Safe for single-org dev. In multi-tenant prod, scope by organization_id.
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.key IN ('goods_receipt.read', 'goods_receipt.write', 'goods_receipt.post')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

SELECT key FROM permissions WHERE key LIKE 'goods_receipt.%' ORDER BY key;
