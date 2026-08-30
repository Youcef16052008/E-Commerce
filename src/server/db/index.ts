import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Client Drizzle (PostgreSQL / Neon).
 * - `max: 1` : connexion unique, adaptée au développement et au serverless léger.
 * - Le schéma est passé afin de disposer des relations et de la typage complet.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. See .env.example.");
}

const sql = postgres(connectionString, { max: 1, prepare: false });

export const db = drizzle(sql, { schema });
export type Database = typeof db;
