import type { Detection } from "../../core/types.js";
import type { AnalyzerPlugin, PluginContext } from "../types.js";
import { detect, uniqByName } from "./util.js";

const DATABASES: Array<{ name: string; modules: string[]; confidence?: number }> = [
  { name: "PostgreSQL", modules: ["pg", "pg-promise", "pg-hstore", "postgres", "psycopg", "psycopg2", "pgx", "tokio-postgres", "org.postgresql"], confidence: 0.93 },
  { name: "MySQL", modules: ["mysql", "mysql2", "mariadb", "mysql-connector-python", "pymysql", "com.mysql"], confidence: 0.9 },
  { name: "MongoDB", modules: ["mongodb", "pymongo", "mongoose"], confidence: 0.92 },
  { name: "Redis", modules: ["redis", "ioredis", "redis-py", "nutshell-redis", "jedis", "lettuce"], confidence: 0.9 },
  { name: "SQLite", modules: ["better-sqlite3", "sqlite3", "sql.js", "modern-sqlite", "sqlalchemy", "sqlite-utils"], confidence: 0.85 },
  { name: "Elasticsearch", modules: ["elasticsearch", "@elastic/elasticsearch"], confidence: 0.85 },
  { name: "Neo4j", modules: ["neo4j", "neo4j-driver"], confidence: 0.8 },
  { name: "DuckDB", modules: ["duckdb", "@duckdb/node-api"], confidence: 0.8 },
  { name: "ClickHouse", modules: ["clickhouse", "@clickhouse/client"], confidence: 0.8 },
  { name: "Cassandra", modules: ["cassandra-driver", "cassandra-db-driver"], confidence: 0.7 },
  { name: "Memcached", modules: ["memcached", "memjs"], confidence: 0.7 },
  { name: "Firestore", modules: ["@firebase/firestore", "firebase-admin-firestore"], confidence: 0.8 },
];

export const databasePlugin: AnalyzerPlugin = {
  id: "builtin.database",
  title: "Databases",
  description: "Detects databases from connectors and data files.",
  detect(ctx: PluginContext): Detection[] {
    const out: Detection[] = [];
    for (const spec of DATABASES) {
      for (const mod of spec.modules) {
        if (ctx.hasModule(mod)) {
          out.push(detect(spec.name, "database", spec.confidence ?? 0.85, undefined, mod));
          break;
        }
      }
    }
    // SQLite via embedded db files
    if (ctx.hasExtension("sqlite") || ctx.hasGlob("**/*.sqlite3") || ctx.hasGlob("*.db") || ctx.hasGlob("**/*.db")) {
      if (!out.some((d) => d.name === "SQLite")) {
        out.push(detect("SQLite", "database", 0.7, "via embedded file", "*.db"));
      }
    }
    return uniqByName(out);
  },
};