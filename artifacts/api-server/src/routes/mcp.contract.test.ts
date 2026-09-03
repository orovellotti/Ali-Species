import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, GET_STATUTS_INPUT_SCHEMA } from "./mcp.js";

describe("get_statuts MCP input contract", () => {
  it("publishes alternative TAXREF and scientific-name identifiers", async () => {
    const server = buildServer();
    const client = new Client({ name: "contract-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const tools = await client.listTools();
      const schema = tools.tools.find((tool) => tool.name === "get_statuts")?.inputSchema;
      expect(schema?.anyOf).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ required: ["cd_nom"] }),
          expect.objectContaining({ required: ["scientificName"] }),
        ]),
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("accepts the TAXREF identifier path", () => {
    expect(GET_STATUTS_INPUT_SCHEMA.parse({ cd_nom: 60577 })).toMatchObject({ cd_nom: 60577 });
  });

  it("accepts the scientific-name path", () => {
    expect(GET_STATUTS_INPUT_SCHEMA.parse({ scientificName: "Lutra lutra" })).toMatchObject({
      scientificName: "Lutra lutra",
    });
  });

  it("keeps the historical camelCase identifier compatible", () => {
    expect(GET_STATUTS_INPUT_SCHEMA.parse({ cdNom: 60577 })).toMatchObject({ cdNom: 60577 });
  });

  it("rejects calls without either identifier", () => {
    expect(() => GET_STATUTS_INPUT_SCHEMA.parse({ region: "Occitanie" })).toThrow();
  });
});