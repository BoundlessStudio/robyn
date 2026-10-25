import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export async function readMigrations(directory) {
  const names = (await fs.readdir(directory)).filter(name => name.endsWith(".sql")).sort();
  return Promise.all(names.map(async filename => {
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(filename)) throw new Error(`Invalid migration filename: ${filename}`);
    // A Windows checkout and a Linux deploy must have the same checksum.
    const sql = (await fs.readFile(path.join(directory, filename), "utf8")).replace(/\r\n/g, "\n");
    return { filename, checksum: createHash("sha256").update(sql).digest("hex"), sql };
  }));
}

function literal(value) {
  let tag = "$robyn$";
  while (value.includes(tag)) tag = tag.slice(0, -1) + "_$";
  return `${tag}${value}${tag}`;
}

export function migrationQuery(migrations, baseline = null) {
  if (baseline && !migrations.some(migration => migration.filename === baseline)) {
    throw new Error("--baseline must name an exact migration file, including its .sql suffix.");
  }
  // One statement/transaction: the Management API may use a different connection
  // on each call. Lock, preflight, SQL and ledger writes must stay together.
  const body = `declare
  manifest jsonb := ${literal(JSON.stringify(migrations))};
  baseline text := ${baseline ? literal(baseline) : "null"};
  migration jsonb;
  recorded record;
  pending boolean := false;
begin
  perform pg_advisory_xact_lock(742365, 1);
  create schema if not exists robyn_setup;
  revoke all on schema robyn_setup from public, anon, authenticated, service_role;
  create table if not exists robyn_setup.migrations (
    filename text primary key,
    checksum text not null,
    baselined boolean not null default false,
    applied_at timestamptz not null default now()
  );
  revoke all on robyn_setup.migrations from public, anon, authenticated, service_role;

  if not exists(select 1 from robyn_setup.migrations) then
    if to_regclass('public.workspaces') is not null or to_regclass('public.studio_projects') is not null
      or to_regclass('public.agents') is not null then
      if baseline is null then
        raise exception 'Existing database has no migration history. No migrations were replayed. Verify the last fully applied file, then use --baseline <filename.sql> (see SETUP.md).';
      end if;
      insert into robyn_setup.migrations(filename, checksum, baselined)
        select value->>'filename', value->>'checksum', true from jsonb_array_elements(manifest)
        where value->>'filename' <= baseline;
    elsif baseline is not null then
      raise exception 'Cannot baseline an empty database. Run setup without --baseline.';
    end if;
  elsif baseline is not null and not exists(select 1 from robyn_setup.migrations where filename=baseline) then
    raise exception 'Migration history already exists. A baseline cannot skip pending migrations.';
  end if;

  -- Validate the entire history before executing any pending SQL. Full filenames
  -- deliberately distinguish the two historical 0007 migrations.
  for recorded in select * from robyn_setup.migrations loop
    select value into migration from jsonb_array_elements(manifest) where value->>'filename'=recorded.filename;
    if migration is null then raise exception 'Applied migration % is missing from this checkout', recorded.filename; end if;
    if migration->>'checksum' <> recorded.checksum then raise exception 'Checksum mismatch for applied migration %', recorded.filename; end if;
  end loop;
  for migration in select value from jsonb_array_elements(manifest) loop
    if exists(select 1 from robyn_setup.migrations where filename=migration->>'filename') then
      if pending then raise exception 'Migration history is not a prefix of this checkout; refusing out-of-order migration %', migration->>'filename'; end if;
    else
      pending := true;
    end if;
  end loop;
  for migration in select value from jsonb_array_elements(manifest) loop
    if not exists(select 1 from robyn_setup.migrations where filename=migration->>'filename') then
      begin
        execute migration->>'sql';
        insert into robyn_setup.migrations(filename, checksum) values(migration->>'filename', migration->>'checksum');
      exception when others then
        raise exception 'Migration % failed: %', migration->>'filename', sqlerrm;
      end;
    end if;
  end loop;
end`;
  return `do ${literal(body)};`;
}

export async function runMigrations(call, ref, { directory, baseline = null, report = () => {}, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const migrations = await readMigrations(directory);
  if (!migrations.length) throw new Error("No migrations found.");
  const query = migrationQuery(migrations, baseline);
  for (let attempt = 1; ; attempt++) {
    try {
      await call("POST", `/v1/projects/${ref}/database/query`, { query });
      report(`Migration history verified; all ${migrations.length} files are applied.`);
      return;
    } catch (error) {
      // A lost acknowledgement retries the exact transaction. The ledger makes
      // an already-committed attempt a no-op, including initial baselining.
      if ((error.status && error.status < 500) || attempt === 4) throw error;
      await sleep(4000 * attempt);
    }
  }
}
