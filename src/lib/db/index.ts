// Drizzle client for EscapeBot
// Uses postgres.js driver (Neon-compatible)

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false, // Neon pooled connections don't support prepared statements
});

export const db = drizzle(client, { schema });
export * from './schema';
