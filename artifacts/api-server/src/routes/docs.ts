import { Router, type IRouter } from "express";
import openapiSpec from "@workspace/api-spec/openapi.yaml";

const router: IRouter = Router();

const SWAGGER_VERSION = "5.17.14";

const docsHtml = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>ALi Species — API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: "/api/openapi.yaml",
          dom_id: "#swagger-ui",
          deepLinking: true,
          docExpansion: "list",
        });
      };
    </script>
  </body>
</html>
`;

router.get("/openapi.yaml", (_req, res) => {
  res.type("application/yaml").send(openapiSpec);
});

router.get("/docs", (_req, res) => {
  res.type("text/html").send(docsHtml);
});

export default router;
