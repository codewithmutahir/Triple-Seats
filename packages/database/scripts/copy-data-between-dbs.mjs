/**
 * One-shot data copy: SOURCE_DATABASE_URL → DEST_DATABASE_URL
 * Schema must already exist on dest (prisma migrate deploy).
 * Skips _prisma_migrations. Uses session_replication_role to bypass FKs.
 *
 * Usage:
 *   SOURCE_DATABASE_URL=... DEST_DATABASE_URL=... node packages/database/scripts/copy-data-between-dbs.mjs
 */
import pg from "pg";

const SOURCE = process.env.SOURCE_DATABASE_URL;
const DEST = process.env.DEST_DATABASE_URL;

if (!SOURCE || !DEST) {
  console.error("Set SOURCE_DATABASE_URL and DEST_DATABASE_URL");
  process.exit(1);
}

/** Parent-before-child order (also safe with session_replication_role). */
const TABLES = [
  "user",
  "account",
  "session",
  "verification",
  "caterers",
  "guests",
  "menu_items",
  "catering_packages",
  "package_price_tiers",
  "package_included_items",
  "package_kitchen_qtys",
  "leads",
  "events",
  "menu_preferences",
  "quotes",
  "quote_line_items",
  "quote_item_idempotency",
  "tasks",
  "messages",
  "payments",
  "payment_reminders",
  "team_members",
  "audit_logs",
];

function client(url) {
  // Strip sslmode from URL — Node pg treats require as verify-full and fails on Supabase.
  const cleaned = url.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
  return new pg.Client({
    connectionString: cleaned,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 60_000,
  });
}

async function insertRows(dst, table, rows) {
  if (rows.length === 0) return 0;
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const BATCH = 100;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = [];
    const placeholders = batch.map((row, ri) => {
      const parts = cols.map((col, ci) => {
        values.push(row[col]);
        return `$${ri * cols.length + ci + 1}`;
      });
      return `(${parts.join(", ")})`;
    });
    await dst.query(
      `INSERT INTO "${table}" (${colList}) VALUES ${placeholders.join(", ")}`,
      values
    );
    inserted += batch.length;
  }
  return inserted;
}

async function main() {
  const src = client(SOURCE);
  const dst = client(DEST);

  console.log("Connecting source…");
  await src.connect();
  console.log("Connecting dest…");
  await dst.connect();

  await dst.query("BEGIN");
  try {
    await dst.query("SET LOCAL session_replication_role = replica");

    const truncateList = TABLES.map((t) => `"${t}"`).join(", ");
    console.log("Truncating dest tables…");
    await dst.query(`TRUNCATE ${truncateList} CASCADE`);

    const summary = [];
    for (const table of TABLES) {
      const { rows } = await src.query(`SELECT * FROM "${table}"`);
      const n = await insertRows(dst, table, rows);
      console.log(`  ${table}: ${n} rows`);
      summary.push({ table, rows: n });
    }

    await dst.query("COMMIT");
    console.log("\nDone. Copied:");
    for (const s of summary) {
      if (s.rows > 0) console.log(`  ${s.table}=${s.rows}`);
    }
    console.log(`Total rows: ${summary.reduce((a, s) => a + s.rows, 0)}`);
  } catch (err) {
    await dst.query("ROLLBACK");
    throw err;
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
