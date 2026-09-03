---
name: MCP alternative input schemas
description: How to publish required input alternatives with the MCP TypeScript SDK 1.29.
---

The MCP protocol requires an input schema whose root type is `object`. With the TypeScript SDK 1.29, a top-level Zod union is accepted for runtime parsing but serialized as an empty object in `tools/list`; wrapping an object in a Zod refinement has the same effect, and a raw union JSON Schema lacks the required root `type`.

**Why:** External MCP clients validate calls from the published `tools/list` contract. A runtime-valid alternative that disappears during serialization still blocks Claude, ChatGPT, and similar clients before invocation.

**How to apply:** Keep a plain object-shaped Zod schema so field types remain visible, enforce the cross-field requirement in the handler, then explicitly decorate the published object schema with root-level `anyOf` clauses. Pin the SDK while this depends on its handler layout. Add in-memory MCP tests that inspect `tools/list` and exercise every call path.