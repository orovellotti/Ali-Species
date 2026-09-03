import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, GET_STATUTS_INPUT_SCHEMA } from "./mcp.js";

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: { ...actual.db, select: selectMock } };
});

function queryReturning(rows: unknown[]) {
  const result = Promise.resolve(rows);
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: result.then.bind(result),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockReturnValue(result);
  return query;
}

async function connectMcp() {
  const server = buildServer();
  const client = new Client({ name: "contract-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

describe("get_statuts MCP input contract", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("publishes alternative TAXREF and scientific-name identifiers", async () => {
    const { server, client } = await connectMcp();

    try {
      const tools = await client.listTools();
      const schema = tools.tools.find((tool) => tool.name === "get_statuts")?.inputSchema;
      expect(schema?.anyOf).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ required: ["cd_nom"] }),
          expect.objectContaining({ required: ["scientificName"] }),
        ]),
      );
      expect(schema?.properties).toMatchObject({
        cd_nom: { type: "integer" },
        scientificName: { type: "string" },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("accepts the TAXREF identifier path", async () => {
    selectMock.mockReturnValueOnce(queryReturning([]));
    const { server, client } = await connectMcp();

    try {
      const result = await client.callTool({
        name: "get_statuts",
        arguments: { cd_nom: 60577 },
      });
      expect(result.isError).not.toBe(true);
      expect(selectMock).toHaveBeenCalledTimes(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("accepts and resolves the scientific-name path", async () => {
    selectMock
      .mockReturnValueOnce(queryReturning([{ cdNom: 60577 }]))
      .mockReturnValueOnce(queryReturning([]));
    const { server, client } = await connectMcp();

    try {
      const result = await client.callTool({
        name: "get_statuts",
        arguments: { scientificName: "Lutra lutra" },
      });
      expect(result.isError).not.toBe(true);
      expect(selectMock).toHaveBeenCalledTimes(2);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("keeps the historical camelCase identifier compatible", async () => {
    selectMock.mockReturnValueOnce(queryReturning([]));
    const { server, client } = await connectMcp();

    try {
      const result = await client.callTool({
        name: "get_statuts",
        arguments: { cdNom: 60577 },
      });
      expect(result.isError).not.toBe(true);
      expect(selectMock).toHaveBeenCalledTimes(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects calls without either identifier", async () => {
    const { server, client } = await connectMcp();

    try {
      const result = await client.callTool({
        name: "get_statuts",
        arguments: { region: "Occitanie" },
      });
      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "cd_nom ou scientificName est requis" }],
      });
      expect(selectMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });
});