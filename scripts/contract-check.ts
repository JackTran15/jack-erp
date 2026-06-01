#!/usr/bin/env ts-node

/**
 * Contract Drift Check
 *
 * Compares exported types from @erp/shared-interfaces against the API
 * controller routes and DTO definitions to flag mismatches.
 *
 * Exit code 0 = no drift detected
 * Exit code 1 = drift detected or scan errors
 *
 * Run: npx ts-node scripts/contract-check.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, 'packages', 'shared-interfaces', 'src');
const API_SRC = path.join(ROOT, 'apps', 'api', 'src');

interface DriftIssue {
  severity: 'error' | 'warning';
  file: string;
  message: string;
}

const issues: DriftIssue[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────

function walkDir(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractExportedNames(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const names: string[] = [];
  const exportRegex = /export\s+(?:interface|type|enum|class|const|function)\s+(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = exportRegex.exec(content)) !== null) {
    names.push(match[1]);
  }
  const reExportRegex = /export\s+\{([^}]+)\}/g;
  while ((match = reExportRegex.exec(content)) !== null) {
    const items = match[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!.trim());
    names.push(...items.filter(Boolean));
  }
  return names;
}

function extractImportedSharedTypes(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const names: string[] = [];
  const importRegex = /import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]@erp\/shared-interfaces['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const items = match[1].split(',').map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim());
    names.push(...items.filter(Boolean));
  }
  return names;
}

// ─── Step 1: Collect all exported types from shared-interfaces ──────────

console.log('Scanning shared-interfaces exports...');

const sharedFiles = walkDir(SHARED_SRC, '.ts');
const sharedExports = new Set<string>();

for (const file of sharedFiles) {
  for (const name of extractExportedNames(file)) {
    sharedExports.add(name);
  }
}

console.log(`  Found ${sharedExports.size} exported types/enums/interfaces`);

// ─── Step 2: Check API imports against shared exports ───────────────────

console.log('Scanning API source for shared-interfaces imports...');

const apiFiles = walkDir(API_SRC, '.ts');
const usedSharedTypes = new Set<string>();

for (const file of apiFiles) {
  const imported = extractImportedSharedTypes(file);
  for (const name of imported) {
    usedSharedTypes.add(name);
    if (!sharedExports.has(name)) {
      issues.push({
        severity: 'error',
        file: path.relative(ROOT, file),
        message: `Imports '${name}' from @erp/shared-interfaces but it is not exported`,
      });
    }
  }
}

// ─── Step 3: Check for unused shared exports (warning) ──────────────────

for (const exported of sharedExports) {
  if (!usedSharedTypes.has(exported)) {
    issues.push({
      severity: 'warning',
      file: 'packages/shared-interfaces',
      message: `'${exported}' is exported but never imported by the API`,
    });
  }
}

// ─── Step 4: Check controller DTOs reference shared types ───────────────

console.log('Checking controller DTO alignment...');

const controllerFiles = apiFiles.filter((f) => f.endsWith('.controller.ts'));

for (const file of controllerFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const hasSharedImport = content.includes('@erp/shared-interfaces');
  const hasDto = content.includes('Dto');

  if (hasDto && !hasSharedImport) {
    issues.push({
      severity: 'warning',
      file: path.relative(ROOT, file),
      message: 'Controller uses DTOs but does not import from @erp/shared-interfaces — verify contract alignment',
    });
  }
}

// ─── Report ─────────────────────────────────────────────────────────────

console.log('\n─── Contract Drift Report ───\n');

const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warning');

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ No contract drift detected.');
  process.exit(0);
}

for (const issue of errors) {
  console.error(`❌ ERROR  [${issue.file}]: ${issue.message}`);
}

for (const issue of warnings) {
  console.warn(`⚠️  WARN   [${issue.file}]: ${issue.message}`);
}

console.log(`\nTotal: ${errors.length} error(s), ${warnings.length} warning(s)`);

if (errors.length > 0) {
  process.exit(1);
}
