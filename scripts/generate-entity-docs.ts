// @ts-nocheck
/**
 * generate-entity-docs.ts
 *
 * Scans all TypeORM entity files under apps/api/src and generates
 * a JSON manifest of entities, columns, relations, indexes, and enums.
 * This manifest can be consumed by other tools to produce markdown,
 * ER diagrams, or feed into code-generation agents.
 *
 * Usage:
 *   npx ts-node scripts/generate-entity-docs.ts
 *
 * Output:
 *   docs/entities/entity-manifest.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const API_SRC = path.resolve(__dirname, '..', 'apps', 'api', 'src');
const OUTPUT = path.resolve(__dirname, '..', 'docs', 'entities', 'entity-manifest.json');

interface ColumnInfo {
  property: string;
  dbColumn: string;
  type: string;
  nullable: boolean;
  default?: string;
  comment?: string;
  isPrimaryKey: boolean;
}

interface RelationInfo {
  property: string;
  kind: string;
  target: string;
  joinColumn?: string;
}

interface EntityInfo {
  className: string;
  tableName: string;
  filePath: string;
  extendsBase: boolean;
  comment?: string;
  columns: ColumnInfo[];
  relations: RelationInfo[];
  indexes: string[];
  uniques: string[];
}

function findEntityFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findEntityFiles(full));
    } else if (entry.name.endsWith('.entity.ts')) {
      results.push(full);
    }
  }
  return results;
}

function extractEntities(filePath: string): EntityInfo[] {
  const source = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const entities: EntityInfo[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isClassDeclaration(node) || !node.name) return;

    const decorators = ts.getDecorators(node) ?? [];
    const entityDec = decorators.find(
      (d) =>
        ts.isCallExpression(d.expression) &&
        ts.isIdentifier(d.expression.expression) &&
        d.expression.expression.text === 'Entity',
    );
    if (!entityDec) return;

    const callExpr = entityDec.expression as ts.CallExpression;
    const tableName =
      callExpr.arguments.length > 0 && ts.isStringLiteral(callExpr.arguments[0])
        ? callExpr.arguments[0].text
        : node.name.text;

    const extendsBase = node.heritageClauses?.some((hc) =>
      hc.types.some(
        (t) => ts.isIdentifier(t.expression) && t.expression.text === 'BaseEntity',
      ),
    ) ?? false;

    const jsDoc = ts.getJSDocCommentsAndTags(node);
    const classComment = jsDoc.length > 0 ? (jsDoc[0] as any).comment : undefined;

    const columns: ColumnInfo[] = [];
    const relations: RelationInfo[] = [];
    const indexes: string[] = [];
    const uniques: string[] = [];

    for (const dec of decorators) {
      if (!ts.isCallExpression(dec.expression)) continue;
      const name = ts.isIdentifier(dec.expression.expression)
        ? dec.expression.expression.text
        : '';
      if (name === 'Index' || name === 'Unique') {
        const args = dec.expression.arguments.map((a) => a.getText(sourceFile));
        (name === 'Index' ? indexes : uniques).push(args.join(', '));
      }
    }

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member) || !member.name) continue;
      const propName = (member.name as ts.Identifier).text;
      const memberDecs = ts.getDecorators(member) ?? [];

      for (const md of memberDecs) {
        if (!ts.isCallExpression(md.expression)) continue;
        const decName = ts.isIdentifier(md.expression.expression)
          ? md.expression.expression.text
          : '';

        if (
          ['Column', 'PrimaryGeneratedColumn', 'CreateDateColumn', 'UpdateDateColumn'].includes(
            decName,
          )
        ) {
          let dbCol = propName;
          let colType = '';
          let nullable = false;
          let defaultVal: string | undefined;
          let comment: string | undefined;
          const isPK = decName === 'PrimaryGeneratedColumn';

          const arg = md.expression.arguments[0];
          if (arg) {
            if (ts.isStringLiteral(arg)) {
              colType = arg.text;
            } else if (ts.isObjectLiteralExpression(arg)) {
              for (const prop of arg.properties) {
                if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
                const key = prop.name.text;
                const val = prop.initializer.getText(sourceFile);
                if (key === 'name') dbCol = val.replace(/['"]/g, '');
                if (key === 'type') colType = val.replace(/['"]/g, '');
                if (key === 'nullable' && val === 'true') nullable = true;
                if (key === 'default') defaultVal = val;
                if (key === 'comment') comment = val.replace(/^['"]|['"]$/g, '');
              }
            }
          }

          columns.push({
            property: propName,
            dbColumn: dbCol,
            type: colType || (isPK ? 'uuid' : 'varchar'),
            nullable,
            default: defaultVal,
            comment,
            isPrimaryKey: isPK,
          });
        }

        if (['ManyToOne', 'OneToMany', 'OneToOne', 'ManyToMany'].includes(decName)) {
          const targetArg = md.expression.arguments[0];
          let target = 'unknown';
          if (targetArg && ts.isArrowFunction(targetArg) && targetArg.body) {
            target = targetArg.body.getText(sourceFile);
          }
          relations.push({ property: propName, kind: decName, target });
        }
      }
    }

    entities.push({
      className: node.name.text,
      tableName,
      filePath: path.relative(path.resolve(__dirname, '..'), filePath),
      extendsBase,
      comment: classComment,
      columns,
      relations,
      indexes,
      uniques,
    });
  });

  return entities;
}

const files = findEntityFiles(API_SRC);
const allEntities: EntityInfo[] = [];
for (const f of files) {
  allEntities.push(...extractEntities(f));
}

allEntities.sort((a, b) => a.className.localeCompare(b.className));

const manifest = {
  generatedAt: new Date().toISOString(),
  totalEntities: allEntities.length,
  entities: allEntities,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2));

console.log(`Generated entity manifest: ${allEntities.length} entities → ${OUTPUT}`);
