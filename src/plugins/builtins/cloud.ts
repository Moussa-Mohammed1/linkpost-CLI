import type { Detection } from "../../core/types.js";
import type { AnalyzerPlugin, PluginContext } from "../types.js";
import { detect, uniqByName } from "./util.js";

const CLOUDS: Array<{ name: string; evidence: string; checks: ((ctx: PluginContext) => boolean)[]; confidence?: number }> = [
  {
    name: "Vercel",
    evidence: "vercel.json",
    checks: [(c) => c.hasFile("vercel.json") || c.hasModule("vercel")],
  },
  {
    name: "Netlify",
    evidence: "netlify.toml",
    checks: [(c) => c.hasFile("netlify.toml") || c.hasFile("netlify.toml") || c.hasModule("netlify-cli")],
  },
  {
    name: "Firebase",
    evidence: "firebase.json",
    checks: [(c) => c.hasFile("firebase.json") || c.hasModule("firebase") || c.hasModule("firebase-tools")],
  },
  {
    name: "Supabase",
    evidence: "supabase/config.toml",
    checks: [(c) => c.hasFile("supabase/config.toml") || c.hasGlob("supabase/**")],
  },
  {
    name: "AWS",
    evidence: "serverless.yml",
    checks: [(c) => c.hasFile("serverless.yml") || c.hasFile("samconfig.toml") || c.hasModule("aws-sdk") || c.hasModule("@aws-sdk/*") || c.hasModule("serverless")],
  },
  {
    name: "AWS Lambda",
    evidence: "serverless.yml",
    checks: [(c) => c.hasFile("serverless.yml") || c.hasGlob("**/lambda.{js,ts,py}") || c.hasFile("template.yaml")],
  },
  { name: "Azure", evidence: "azure-pipelines.yml", checks: [(c) => c.hasFile("azure-pipelines.yml") || c.hasModule("@azure/identity") || c.hasModule("azure-functions")] },
  { name: "GCP", evidence: "cloudbuild.yaml", checks: [(c) => c.hasFile("cloudbuild.yaml") || c.hasFile("app.yaml") || c.hasModule("@google-cloud/*")] },
  { name: "Cloudflare Workers", evidence: "wrangler.toml", checks: [(c) => c.hasFile("wrangler.toml") || c.hasFile("wrangler.jsonc") || c.hasModule("wrangler") || c.hasModule("@cloudflare/workers-types")] },
  { name: "Fly.io", evidence: "fly.toml", checks: [(c) => c.hasFile("fly.toml")] },
  { name: "Railway", evidence: "railway.json", checks: [(c) => c.hasFile("railway.json") || c.hasFile("railway.toml")] },
  { name: "Render", evidence: "render.yaml", checks: [(c) => c.hasFile("render.yaml")] },
  { name: "Kubernetes", evidence: "k8s", checks: [(c) => c.hasGlob("k8s/**") || c.hasGlob("deploy/**/deployment.*.yaml") || c.hasFile("Chart.yaml")] },
  { name: "Heroku", evidence: "Procfile", checks: [(c) => c.hasFile("Procfile") || c.hasFile("heroku.yml")] },
  { name: "DigitalOcean App Platform", evidence: ".do/app.yaml", checks: [(c) => c.hasFile(".do/app.yaml")] },
];

export const cloudPlugin: AnalyzerPlugin = {
  id: "builtin.cloud",
  title: "Cloud / Hosting",
  description: "Detects cloud providers and hosting platforms.",
  detect(ctx: PluginContext): Detection[] {
    const out: Detection[] = [];
    for (const spec of CLOUDS) {
      if (spec.checks.some((check) => check(ctx))) {
        out.push(detect(spec.name, "cloud", spec.confidence ?? 0.85, undefined, spec.evidence));
      }
    }
    return uniqByName(out);
  },
};