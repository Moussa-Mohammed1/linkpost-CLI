import type { Detection } from "../../core/types.js";
import type { AnalyzerPlugin, PluginContext } from "../types.js";
import { detect, uniqByName } from "./util.js";

const AUTH_STACKS: Array<{ name: string; modules: string[]; files?: string[]; confidence?: number }> = [
  { name: "Passport.js", modules: ["passport", "passport-jwt", "passport-google-oauth20", "passport-local"], confidence: 0.9 },
  { name: "NextAuth", modules: ["next-auth", "@auth/core"], confidence: 0.9 },
  { name: "Clerk", modules: ["@clerk/nextjs", "@clerk/clerk-react", "@clerk/backend"], confidence: 0.92 },
  { name: "Auth0", modules: ["auth0", "@auth0/auth0-react", "@auth0/auth0-spa-js"], confidence: 0.9 },
  { name: "Firebase Auth", modules: ["firebase/auth", "@react-native-firebase/auth"], confidence: 0.85 },
  { name: "Supabase Auth", modules: ["@supabase/supabase-js", "@supabase/auth-helpers"], confidence: 0.85 },
  { name: "Keycloak", modules: ["keycloak-js", "org.keycloak"], confidence: 0.85 },
  { name: "JWT", modules: ["jsonwebtoken", "jose", "pyjwt", "jwt", "jjwt"], confidence: 0.85 },
  { name: "Spring Security", modules: ["org.springframework.security", "spring-security"], confidence: 0.9 },
  { name: "Django auth", modules: ["django-allauth", "djangorestframework-simplejwt"], confidence: 0.85 },
  { name: "Firebase Auth (Flutter)", modules: ["firebase_auth"], confidence: 0.8 },
  { name: "Bcrypt", modules: ["bcrypt", "bcryptjs"], confidence: 0.7 },
  { name: "JWT Guard", modules: ["passport"], confidence: 0.7 },
  { name: "Amazon Cognito", modules: ["aws-amplify", "@aws-sdk/client-cognito-identity"], confidence: 0.7 },
];

export const authPlugin: AnalyzerPlugin = {
  id: "builtin.auth",
  title: "Authentication",
  description: "Detects authentication and authorization libraries.",
  detect(ctx: PluginContext): Detection[] {
    const out: Detection[] = [];
    for (const stack of AUTH_STACKS) {
      const hit = stack.modules.find((m) => ctx.hasModule(m));
      if (hit) {
        out.push(detect(stack.name, "authentication", stack.confidence ?? 0.85, undefined, hit));
      }
    }
    return uniqByName(out);
  },
};