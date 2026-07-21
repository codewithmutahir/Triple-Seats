import pg from "pg";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres.slqcypcclkoihmwqavuf:tripleseats%23123@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

const cleaned = url
  .replace(/[?&]sslmode=[^&]*/g, "")
  .replace(/[?&]pgbouncer=[^&]*/g, "")
  .replace(/\?&/, "?")
  .replace(/\?$/, "");

const c = new pg.Client({
  connectionString: cleaned,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
});

await c.connect();
const r = await c.query('select count(*)::int as users from "user"');
console.log("US pooler OK — users:", r.rows[0].users);
await c.end();
