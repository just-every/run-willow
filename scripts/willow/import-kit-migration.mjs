// Writes the import-kit D1 schema as one numbered Willow migration, in the order
// initializeD1ImportStorage applies it. Run once when adopting a kit revision;
// never rewrite an applied migration (add a new numbered one instead).
import { writeFileSync } from 'node:fs';
const d1 = await import('../../src/modules/import-kit/src/d1/index.ts');
const groups = [d1.d1Schema, d1.d1ErasureSchema, [...d1.d1StreamOriginSchema, ...d1.d1LegacyStreamReceiptUpgrade], d1.d1StagingSchema, d1.d1NativeStagingSchema, d1.d1CustodyStateSchema, d1.d1ReversalFenceSchema, d1.d1PreparationSchema, d1.d1RetirementSchema];
const selected = process.argv.includes('--upgrade') ? [d1.d1ReversalFenceSchema, d1.d1RetirementSchema] : groups;
const statements = selected.flat().map(sql => sql.trim().replace(/;\s*$/, ''));
writeFileSync(process.argv[2], '-- Base import-kit D1 schema (runeditrun/base 4c83ea57, modules/import-kit).\n' + statements.map(sql => sql + ';').join('\n') + '\n');
console.log(`${statements.length} statements`);
