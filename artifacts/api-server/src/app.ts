import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import pinoHttp from "pino-http";
import router, { shareRouter } from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const ALLOWED_ORIGIN_HOSTS = [
  /\.replit\.dev$/,
  /\.replit\.app$/,
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
];

const corsOptions: CorsOptions = {
  origin(origin, cb) {
    // Same-origin / non-browser requests (curl, MCP clients, server-side fetch) have no Origin header.
    if (!origin) return cb(null, true);
    try {
      const host = new URL(origin).host;
      if (ALLOWED_ORIGIN_HOSTS.some((re) => re.test(host))) return cb(null, true);
    } catch {
      // fall through
    }
    return cb(null, false);
  },
  credentials: true,
};

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors(corsOptions));
// The ops-only bulk HABREF import ships thousands of rows (~3MB) in one atomic
// request; it parses its own large body *after* the admin auth check (see
// admin.ts) so an unauthenticated caller can never force a big pre-auth parse.
// Every other route keeps the tight global default below.
const globalJson = express.json({ limit: "100kb" });
app.use((req, res, next) => {
  if (req.path === "/api/admin/habref/import") return next();
  return globalJson(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use("/api", router);
app.use(shareRouter);

export default app;
