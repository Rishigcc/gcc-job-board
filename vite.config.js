import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev-only: serve the Vercel serverless function(s) under `npm run dev`
// so /api routes can be tested locally without `vercel dev`. This has
// no effect on production builds (apply: "serve"); on Vercel the real
// serverless function in /api handles these requests.
function devApiPlugin(env) {
  return {
    name: "dev-api-functions",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        "/api/send-welcome-email",
        async (req, res) => {
          // The serverless handler reads config from process.env; make
          // the .env.local values available to it during dev.
          process.env.BREVO_API_KEY ??= env.BREVO_API_KEY;
          process.env.VITE_SUPABASE_URL ??= env.VITE_SUPABASE_URL;
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??=
            env.VITE_SUPABASE_PUBLISHABLE_KEY;

          // Shim the Vercel-style res helpers on top of Node's res.
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (obj) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(obj));
          };

          try {
            const mod = await server.ssrLoadModule(
              "/api/send-welcome-email.js"
            );
            await mod.default(req, res);
          } catch (err) {
            console.error("Dev /api handler error:", err);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Dev handler crashed" }));
          }
        }
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss(), devApiPlugin(env)],
  };
});
