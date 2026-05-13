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
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use("/api", router);
app.use(shareRouter);

export default app;
