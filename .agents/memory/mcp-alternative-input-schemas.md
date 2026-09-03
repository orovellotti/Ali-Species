---
name: MCP alternative input schemas
description: How to publish required input alternatives with the MCP TypeScript SDK 1.29.
---

The MCP protocol requires an input schema whose root type is `object`. With the TypeScript SDK 1.29, a top-level Zod union is accepted for runtime parsing but serialized as an empty object in `tools/list`; a raw union JSON Schema also lacks the required root `type`.

**Why:** External MCP clients validate calls from the published `tools/list` contract. A runtime-valid alternative that disappears during serialization still blocks Claude, ChatGPT, and similar clients before invocation.

**How to apply:** Keep an object-shaped Zod schema for runtime validation, then explicitly decorate the published object schema with root-level `anyOf` clauses. Add an in-memory MCP contract test that inspects the actual `tools/list` response rather than testing only the Zod schema.