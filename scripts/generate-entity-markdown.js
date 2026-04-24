/**
 * generate-entity-markdown.js
 *
 * Reads docs/entities/entity-manifest.json and generates markdown docs
 * grouped by module under docs/entities/generated/.
 *
 * Usage:
 *   node scripts/generate-entity-markdown.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'docs', 'entities', 'entity-manifest.json');
const OUT_DIR = path.join(ROOT, 'docs', 'entities', 'generated');

function inferModule(filePath) {
  const normalized = filePath.replace(/\\/g, '/');

  const directMap = [
    { test: '/modules/auth/', key: 'auth', title: 'Auth' },
    { test: '/modules/organization/', key: 'organization-branch', title: 'Organization & Branch' },
    { test: '/modules/branch/', key: 'organization-branch', title: 'Organization & Branch' },
    { test: '/modules/registration/', key: 'organization-branch', title: 'Organization & Branch' },
    { test: '/modules/customer/', key: 'customer', title: 'Customer' },
    { test: '/modules/sales-hierarchy/', key: 'sales-hierarchy', title: 'Sales Hierarchy' },
    { test: '/modules/document-numbering/', key: 'document-numbering', title: 'Document Numbering' },
    { test: '/modules/inventory/', key: 'inventory', title: 'Inventory' },
    { test: '/modules/accounting/', key: 'accounting', title: 'Accounting' },
    { test: '/modules/pos/', key: 'pos', title: 'POS' },
    { test: '/database/entities/', key: 'database-base', title: 'Database Base' },
  ];

  for (const m of directMap) {
    if (normalized.includes(m.test)) return m;
  }

  return { key: 'misc', title: 'Miscellaneous' };
}

function cleanType(type) {
  if (!type) return 'unknown';
  return String(type).trim();
}

function formatConstraintBits(column) {
  const bits = [];
  if (column.isPrimaryKey) bits.push('PK');
  if (!column.nullable) bits.push('NN');
  if (column.default !== undefined) bits.push(`default: ${column.default}`);
  return bits.length ? bits.join(', ') : '-';
}

function buildEntitySection(entity) {
  const lines = [];
  lines.push(`## ${entity.className}`);
  lines.push('');
  lines.push(`- **Table:** \`${entity.tableName}\``);
  lines.push(`- **Source:** \`${entity.filePath}\``);
  lines.push(`- **Extends BaseEntity:** ${entity.extendsBase ? 'Yes' : 'No'}`);
  if (entity.comment) lines.push(`- **Description:** ${entity.comment}`);
  lines.push('');

  if (entity.uniques?.length) {
    lines.push('### Unique Constraints');
    for (const uq of entity.uniques) lines.push(`- \`${uq}\``);
    lines.push('');
  }

  if (entity.indexes?.length) {
    lines.push('### Indexes');
    for (const idx of entity.indexes) lines.push(`- \`${idx}\``);
    lines.push('');
  }

  lines.push('### Columns');
  lines.push('');
  lines.push('| Property | DB Column | Type | Constraints | Description |');
  lines.push('|----------|-----------|------|-------------|-------------|');
  for (const col of entity.columns || []) {
    const desc = col.comment ? col.comment.replace(/\|/g, '\\|') : '-';
    lines.push(
      `| \`${col.property}\` | \`${col.dbColumn}\` | \`${cleanType(col.type)}\` | ${formatConstraintBits(col)} | ${desc} |`,
    );
  }
  lines.push('');

  if (entity.relations?.length) {
    lines.push('### Relations');
    for (const rel of entity.relations) {
      const target = rel.target ? ` → \`${rel.target}\`` : '';
      lines.push(`- \`${rel.kind}\` \`${rel.property}\`${target}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

function writeModuleFile(moduleTitle, moduleKey, entities) {
  const filePath = path.join(OUT_DIR, `${moduleKey}.md`);
  const content = [
    `# ${moduleTitle} Entities`,
    '',
    `Generated from \`docs/entities/entity-manifest.json\`.`,
    '',
    `Total entities: **${entities.length}**`,
    '',
    '---',
    '',
    ...entities.map(buildEntitySection),
  ].join('\n');

  fs.writeFileSync(filePath, content);
  return filePath;
}

function writeIndex(modules, totalEntities) {
  const indexPath = path.join(OUT_DIR, 'README.md');
  const lines = [];
  lines.push('# Generated Entity Docs');
  lines.push('');
  lines.push('This folder is auto-generated from `entity-manifest.json`.');
  lines.push('');
  lines.push(`Total entities: **${totalEntities}**`);
  lines.push('');
  lines.push('## Modules');
  lines.push('');
  for (const m of modules) {
    lines.push(`- [${m.title}](./${m.key}.md) - ${m.count} entities`);
  }
  lines.push('');
  lines.push('Regenerate with: `pnpm docs:entities`');
  lines.push('');

  fs.writeFileSync(indexPath, lines.join('\n'));
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `Manifest not found at ${MANIFEST_PATH}. Run manifest generator first.`,
    );
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const entities = Array.isArray(manifest.entities) ? manifest.entities : [];

  const grouped = new Map();
  for (const entity of entities) {
    const mod = inferModule(entity.filePath || '');
    if (!grouped.has(mod.key)) {
      grouped.set(mod.key, { title: mod.title, key: mod.key, entities: [] });
    }
    grouped.get(mod.key).entities.push(entity);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const moduleSummaries = [];
  for (const group of grouped.values()) {
    group.entities.sort((a, b) => a.className.localeCompare(b.className));
    writeModuleFile(group.title, group.key, group.entities);
    moduleSummaries.push({
      title: group.title,
      key: group.key,
      count: group.entities.length,
    });
  }

  moduleSummaries.sort((a, b) => a.title.localeCompare(b.title));
  writeIndex(moduleSummaries, entities.length);

  console.log(
    `Generated markdown docs: ${entities.length} entities across ${moduleSummaries.length} modules -> docs/entities/generated`,
  );
}

main();
