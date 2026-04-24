/**
 * generate-entity-docs.js
 *
 * Lightweight manifest generator for TypeORM entities.
 * No TypeScript runtime dependency required.
 *
 * Usage:
 *   node scripts/generate-entity-docs.js
 *
 * Output:
 *   docs/entities/entity-manifest.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API_SRC = path.join(ROOT, 'apps', 'api', 'src');
const OUTPUT = path.join(ROOT, 'docs', 'entities', 'entity-manifest.json');

function findEntityFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findEntityFiles(full));
      continue;
    }
    if (entry.name.endsWith('.entity.ts')) out.push(full);
  }
  return out;
}

function parseEntity(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split('\n');

  const classMatch = src.match(/export\s+class\s+(\w+)\s*(?:extends\s+(\w+))?/);
  if (!classMatch) return null;

  const tableMatch = src.match(/@Entity\((['"`])([^'"`]+)\1\)/);
  const className = classMatch[1];
  const extendsBase = classMatch[2] === 'BaseEntity';
  const tableName = tableMatch ? tableMatch[2] : className;

  const columns = [];
  const relations = [];
  const indexes = [];
  const uniques = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('@Index(')) indexes.push(line);
    if (line.startsWith('@Unique(')) uniques.push(line);

    const relation = line.match(/^@(ManyToOne|OneToMany|OneToOne|ManyToMany)\(/);
    if (relation) {
      let prop = '';
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        const propLine = lines[j].trim();
        const propMatch = propLine.match(/^(\w+)\??:\s*([^;]+);/);
        if (propMatch) {
          prop = propMatch[1];
          break;
        }
      }
      relations.push({ property: prop || 'unknown', kind: relation[1] });
    }

    const col = line.match(/^@(Column|PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn)\(/);
    if (!col) continue;

    const decorator = col[1];
    const block = [line];
    let cursor = i + 1;
    while (cursor < lines.length && !lines[cursor].includes(')')) {
      block.push(lines[cursor].trim());
      cursor++;
    }
    if (cursor < lines.length) block.push(lines[cursor].trim());
    const joined = block.join(' ');

    let prop = 'unknown';
    for (let j = cursor + 1; j < Math.min(lines.length, cursor + 8); j++) {
      const propMatch = lines[j].trim().match(/^(\w+)\??:\s*([^;]+);/);
      if (propMatch) {
        prop = propMatch[1];
        break;
      }
    }

    const dbName = (joined.match(/name:\s*['"`]([^'"`]+)['"`]/) || [])[1] || prop;
    const type = (joined.match(/type:\s*['"`]([^'"`]+)['"`]/) || [])[1] || (decorator === 'PrimaryGeneratedColumn' ? 'uuid' : 'unknown');
    const nullable = /nullable:\s*true/.test(joined);
    const comment = (joined.match(/comment:\s*['"`]([^'"`]+)['"`]/) || [])[1];
    const defaultValue = (joined.match(/default:\s*([^,}\)]+)/) || [])[1]?.trim();

    columns.push({
      property: prop,
      dbColumn: dbName,
      type,
      nullable,
      default: defaultValue,
      comment,
      isPrimaryKey: decorator === 'PrimaryGeneratedColumn',
    });

    i = cursor;
  }

  return {
    className,
    tableName,
    filePath: path.relative(ROOT, filePath),
    extendsBase,
    columns,
    relations,
    indexes,
    uniques,
  };
}

function main() {
  const files = findEntityFiles(API_SRC);
  const entities = files
    .map(parseEntity)
    .filter(Boolean)
    .sort((a, b) => a.className.localeCompare(b.className));

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalEntities: entities.length,
        entities,
      },
      null,
      2,
    ),
  );

  console.log(`Generated entity manifest: ${entities.length} entities -> ${path.relative(ROOT, OUTPUT)}`);
}

main();
