import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import * as schema from '../lib/db/schema';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

const sql = neon(process.env.POSTGRES_URL);
const db = drizzle({ client: sql, schema });

async function run() {
  await migrate(db, { migrationsFolder: 'lib/db/migrations' });
  console.log('Migrations applied successfully.');
  process.exit(0);
}

run().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});