import type { Detection } from "../../core/types.js";
import type { AnalyzerPlugin, PluginContext } from "../types.js";
import { detect, uniqByName } from "./util.js";

const ORMS: Array<{ name: string; modules: string[]; files?: string[]; confidence?: number }> = [
  { name: "Prisma", modules: ["prisma", "@prisma/client"], files: ["prisma/schema.prisma"], confidence: 0.96 },
  { name: "TypeORM", modules: ["typeorm"], confidence: 0.9 },
  { name: "Sequelize", modules: ["sequelize", "sequelize-cli"], confidence: 0.88 },
  { name: "Drizzle", modules: ["drizzle-orm"], confidence: 0.88 },
  { name: "Knex", modules: ["knex"], confidence: 0.85 },
  { name: "Mongoose", modules: ["mongoose"], confidence: 0.9 },
  { name: "SQLAlchemy", modules: ["sqlalchemy"], confidence: 0.92 },
  { name: "SQLModel", modules: ["sqlmodel"], confidence: 0.9 },
  { name: "Peewee", modules: ["peewee"], confidence: 0.85 },
  { name: "Tortoise ORM", modules: ["tortoise-orm"], confidence: 0.8 },
  { name: "GORM", modules: ["gorm.io/gorm", "jinzhu/gorm", "gorm"], confidence: 0.9 },
  { name: "sqlx", modules: ["sqlx"], confidence: 0.75 },
  { name: "Diesel", modules: ["diesel"], confidence: 0.85 },
  { name: "Entity Framework", modules: ["microsoft.entityframeworkcore", "entityframework"], confidence: 0.85 },
  { name: "MyBatis", modules: ["mybatis", "org.mybatis"], confidence: 0.85 },
  { name: "Doctrine", modules: ["doctrine/orm", "doctrine/dbal"], confidence: 0.85 },
  { name: "Eloquent", modules: ["illuminate/database"], confidence: 0.8 },
];

export const ormPlugin: AnalyzerPlugin = {
  id: "builtin.orm",
  title: "ORM",
  description: "Detects object-relational mapping libraries.",
  detect(ctx: PluginContext): Detection[] {
    const out: Detection[] = [];
    for (const spec of ORMS) {
      const byModule = spec.modules.some((m) => ctx.hasModule(m));
      const byFile = spec.files?.some((f) => ctx.hasFile(f));
      if (byModule || byFile) {
        out.push(
          detect(spec.name, "orm", spec.confidence ?? 0.85, undefined, byModule ? spec.modules[0] : spec.files?.[0]),
        );
      }
    }
    return uniqByName(out);
  },
};