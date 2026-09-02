import { drizzle } from "drizzle-orm/neon-serverless";
import { defineRelations } from "drizzle-orm";
import { getPool } from "./pool";
import * as schema from "./schema";

const relations = defineRelations(schema);

export const db = drizzle({ client: getPool(), relations });
