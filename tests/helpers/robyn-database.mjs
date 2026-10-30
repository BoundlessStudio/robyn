import {fileURLToPath} from 'node:url';
import {readMigrations,migrationQuery} from '../../scripts/migrations.mjs';

export const craftIds=['cadcraft','deckcraft','designcraft','effectcraft','figcraft','filmcraft','gridcraft',
  'lightcraft','pdfcraft','photocraft','solidcraft','soundcraft','vectorcraft','wordcraft'];

// Default to the complete checksummed schema. A ceiling is explicit and exists
// only for fixtures that test the forward migration from historical behavior.
export async function applyStudioMigrations(db,through=null) {
  const migrations=await readMigrations(fileURLToPath(new URL('../../supabase/migrations/',import.meta.url)));
  await db.exec(migrationQuery(through?migrations.filter(m=>m.filename<=through):migrations));
}
