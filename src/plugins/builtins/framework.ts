import type { Detection, TechCategory } from "../../core/types.js";
import type { AnalyzerPlugin, PluginContext } from "../types.js";
import { detect, uniqByName } from "./util.js";

interface ModuleSpec {
  name: string;
  category: TechCategory;
  modules: string[];
  confidence?: number;
  detail?: string;
}

const FRAMEWORKS: ModuleSpec[] = [
  // ---- Frontend frameworks ----
  { name: "React", category: "frontend-framework", modules: ["react", "@testing-library/react"], confidence: 0.95 },
  { name: "Next.js", category: "frontend-framework", modules: ["next"], confidence: 0.95 },
  { name: "Vue.js", category: "frontend-framework", modules: ["vue", "@vue/test-utils"], confidence: 0.95 },
  { name: "Nuxt", category: "frontend-framework", modules: ["nuxt"], confidence: 0.9 },
  { name: "Angular", category: "frontend-framework", modules: ["@angular/core", "ng"], confidence: 0.95 },
  { name: "Svelte", category: "frontend-framework", modules: ["svelte"], confidence: 0.95 },
  { name: "SvelteKit", category: "frontend-framework", modules: ["@sveltejs/kit"], confidence: 0.9 },
  { name: "Astro", category: "frontend-framework", modules: ["astro"], confidence: 0.9 },
  { name: "Remix", category: "frontend-framework", modules: ["@remix-run/react", "remix"], confidence: 0.88 },
  { name: "SolidJS", category: "frontend-framework", modules: ["solid-js"], confidence: 0.88 },
  { name: "Preact", category: "frontend-framework", modules: ["preact"], confidence: 0.85 },
  { name: "React Native", category: "frontend-framework", modules: ["react-native", "expo"], confidence: 0.95 },
  { name: "Flutter", category: "frontend-framework", modules: ["flutter"], confidence: 0.95 },
  { name: "Electron", category: "frontend-framework", modules: ["electron", "electron-builder"], confidence: 0.9 },
  { name: "Tauri", category: "frontend-framework", modules: ["@tauri-apps/api", "tauri"], confidence: 0.85 },
  { name: "Ionic", category: "frontend-framework", modules: ["@ionic/react", "@ionic/vue", "ionic"], confidence: 0.8 },

  // ---- Backend frameworks ----
  { name: "Express", category: "backend-framework", modules: ["express"], confidence: 0.95 },
  { name: "Fastify", category: "backend-framework", modules: ["fastify"], confidence: 0.9 },
  { name: "NestJS", category: "backend-framework", modules: ["@nestjs/core"], confidence: 0.95 },
  { name: "Koa", category: "backend-framework", modules: ["koa"], confidence: 0.8 },
  { name: "Hono", category: "backend-framework", modules: ["hono"], confidence: 0.85 },
  { name: "FastAPI", category: "backend-framework", modules: ["fastapi"], confidence: 0.95 },
  { name: "Flask", category: "backend-framework", modules: ["flask", "flask-cors"], confidence: 0.93 },
  { name: "Django", category: "backend-framework", modules: ["django"], confidence: 0.95 },
  { name: "Ruby on Rails", category: "backend-framework", modules: ["rails"], confidence: 0.95 },
  { name: "Spring Boot", category: "backend-framework", modules: ["org.springframework.boot", "spring-boot", "spring-web"], confidence: 0.95 },
  { name: "Quarkus", category: "backend-framework", modules: ["quarkus-core", "io.quarkus"], confidence: 0.85 },
  { name: "Micronaut", category: "backend-framework", modules: ["io.micronaut"], confidence: 0.8 },
  { name: "Laravel", category: "backend-framework", modules: ["laravel/framework"], confidence: 0.95 },
  { name: "Symfony", category: "backend-framework", modules: ["symfony/http-kernel", "symfony/framework-bundle"], confidence: 0.9 },
  { name: "Gin", category: "backend-framework", modules: ["gin-gonic/gin", "gin"], confidence: 0.9 },
  { name: "Echo", category: "backend-framework", modules: ["argo.echo", "echo"], confidence: 0.7 },
  { name: "Fiber", category: "backend-framework", modules: ["gofiber/fiber"], confidence: 0.85 },
  { name: "Axum", category: "backend-framework", modules: ["axum"], confidence: 0.9 },
  { name: "Actix Web", category: "backend-framework", modules: ["actix-web"], confidence: 0.88 },
  { name: "Rocket", category: "backend-framework", modules: ["rocket"], confidence: 0.8 },
  { name: "ASP.NET Core", category: "backend-framework", modules: ["microsoft.aspnetcore", "aspnetcore"], confidence: 0.85 },
  { name: "Phoenix", category: "backend-framework", modules: ["phoenix"], confidence: 0.8 },
  { name: "Sinatra", category: "backend-framework", modules: ["sinatra"], confidence: 0.75 },
  { name: "tRPC", category: "backend-framework", modules: ["@trpc/server"], confidence: 0.85 },
  { name: "GraphQL Server", category: "backend-framework", modules: ["mercurius", "apollo-server"], confidence: 0.85 },
];

interface FileRule {
  name: string;
  category: TechCategory;
  /** any match suffices */
  paths: string[];
  ext?: string;
  confidence: number;
}

const FILE_RULES: FileRule[] = [
  { name: "Next.js", category: "frontend-framework", paths: ["next.config.js", "next.config.mjs", "next.config.ts"], confidence: 0.85 },
  { name: "Nuxt", category: "frontend-framework", paths: ["nuxt.config.ts", "nuxt.config.js"], confidence: 0.85 },
  { name: "Astro", category: "frontend-framework", paths: ["astro.config.mjs", "astro.config.ts"], ext: "astro", confidence: 0.85 },
  { name: "SvelteKit", category: "frontend-framework", paths: ["svelte.config.js", "svelte.config.ts"], ext: "svelte", confidence: 0.75 },
  { name: "Angular", category: "frontend-framework", paths: ["angular.json"], confidence: 0.85 },
  { name: "Flutter", category: "frontend-framework", paths: ["pubspec.yaml"], ext: "dart", confidence: 0.9 },
  { name: "Gatsby", category: "frontend-framework", paths: ["gatsby-config.js", "gatsby-config.ts"], confidence: 0.8 },
  { name: "Django", category: "backend-framework", paths: ["manage.py"], confidence: 0.8 },
  { name: "Rails", category: "backend-framework", paths: ["config/routes.rb"], confidence: 0.8 },
  { name: "Laravel", category: "backend-framework", paths: ["artisan"], confidence: 0.8 },
  { name: "Flask", category: "backend-framework", paths: ["app.py", "wsgi.py"], confidence: 0.5 },
  { name: "FastAPI", category: "backend-framework", paths: ["main.py"], confidence: 0.5 },
];

export const frameworkPlugin: AnalyzerPlugin = {
  id: "builtin.framework",
  title: "Frameworks",
  description: "Detects frontend and backend frameworks from manifests and files.",
  detect(ctx: PluginContext): Detection[] {
    const out: Detection[] = [];
    for (const spec of FRAMEWORKS) {
      if (spec.modules.some((m) => ctx.hasModule(m))) {
        out.push(
          detect(
            spec.name,
            spec.category,
            spec.confidence ?? 0.8,
            spec.detail,
            spec.modules.find((m) => ctx.hasModule(m)),
          ),
        );
      }
    }
    for (const rule of FILE_RULES) {
      if (out.some((d) => d.name === rule.name)) continue; // already detected
      const hitPath = rule.paths.some((p) => ctx.hasFile(p));
      const hitExt = rule.ext ? ctx.hasExtension(rule.ext) : false;
      if (hitPath || hitExt) {
        out.push(detect(rule.name, rule.category, rule.confidence, undefined, rule.paths[0]));
      }
    }
    return uniqByName(out);
  },
};