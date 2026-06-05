import path, { resolve } from "node:path";
import {
  defineConfig,
  loadEnv,
  type CorsOptions,
  type ViteDevServer,
} from "vite";
import { vitePlugin as remix } from "@remix-run/dev";
import { vercelPreset } from "@vercel/remix/vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import pc from "picocolors";

import { readFileSync, existsSync } from "node:fs";
import fg from "fast-glob";

const rootDir = ["..", "../..", "../../.."]
  .map((dir) => path.join(__dirname, dir))
  .find((dir) => existsSync(path.join(dir, ".git")));

const hasPrivateFolders =
  fg.sync([path.join(rootDir ?? "", "packages/*/private-src/*")], {
    ignore: ["**/node_modules/**"],
  }).length > 0;

const conditions = hasPrivateFolders
  ? ["webstudio-private", "webstudio"]
  : ["webstudio"];

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (mode === "development") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  // Dynamic import with non-static path so esbuild doesn't resolve it during config bundling.
  // Avoids pulling @webstudio-is/http-client (via origins.ts) at config load time,
  // where the package isn't built yet. Only used for dev server CORS, never in test mode.
  let isBuilderUrl: (url: string) => boolean = () => false;
  let getAuthorizationServerOrigin: (url: string) => string = () => "";
  if (mode !== "test") {
    const importPath = "./app/shared/router-utils/origins";
    const origins = await import(importPath);
    isBuilderUrl = origins.isBuilderUrl;
    getAuthorizationServerOrigin = origins.getAuthorizationServerOrigin;
  }

  return {
    plugins: [
      remix({
        presets: [vercelPreset()],
        future: {
          v3_lazyRouteDiscovery: false,
          v3_relativeSplatPath: false,
          v3_singleFetch: false,
          v3_fetcherPersist: false,
          v3_throwAbortReason: false,
        },
      }),
      {
        name: "request-timing-logger",
        configureServer(server: ViteDevServer) {
          server.middlewares.use(
            (req: IncomingMessage, res: ServerResponse, next: () => void) => {
              const start = Date.now();
              res.on("finish", () => {
                const duration = Date.now() - start;
                if (
                  !(
                    req.url?.startsWith("/@") ||
                    req.url?.startsWith("/app") ||
                    req.url?.includes("/node_modules")
                  )
                ) {
                  console.info(
                    `[${req.method}] ${req.url} - ${duration}ms : ${pc.dim(req.headers.host)}`
                  );
                }
              });
              next();
            }
          );
        },
      },
    ],
    resolve: {
      conditions: [...conditions, "browser", "development|production"],
      alias: [
        {
          find: "~",
          replacement: resolve("app"),
        },

        // before 2,899.74 kB, after 2,145.98 kB
        {
          find: "@supabase/node-fetch",
          replacement: resolve("./app/shared/empty.ts"),
        },
      ],
    },
    ssr: {
      resolve: {
        conditions: [...conditions, "node", "development|production"],
      },
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
    server: {
      host: "wstd.dev",
      proxy: {},
      https:
        mode === "development"
          ? {
              key: readFileSync(
                `${env.WSTD_HTTPS_DIR ?? "../../https"}/privkey.pem`
              ),
              cert: readFileSync(
                `${env.WSTD_HTTPS_DIR ?? "../../https"}/fullchain.pem`
              ),
            }
          : undefined,
      cors: ((
        req: IncomingMessage,
        callback: (error: Error | null, options: CorsOptions | null) => void
      ) => {
        if (req.method === "OPTIONS" || req.method === "POST") {
          if (req.headers.origin != null && req.url != null) {
            const url = new URL(req.url, `https://${req.headers.host}`);

            if (url.pathname === "/builder-logout" && isBuilderUrl(url.href)) {
              return callback(null, {
                origin: getAuthorizationServerOrigin(url.href),
                preflightContinue: false,
                credentials: true,
              });
            }
          }

          if (req.method === "OPTIONS") {
            return callback(null, {
              preflightContinue: false,
              optionsSuccessStatus: 405,
            });
          }
        }

        return callback(null, {
          origin: false,
        });
      }) as never,
    },
    envPrefix: "GITHUB_",
    test: {
      server: {
        deps: {
          inline: ["@webstudio-is/http-client"],
        },
      },
    },
  };
});
