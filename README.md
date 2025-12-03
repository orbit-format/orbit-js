<p align="center">
  <img src="https://img.shields.io/npm/v/orbit-js.svg" alt="npm version" />
  <img src="https://img.shields.io/npm/l/orbit-js.svg" alt="license" />
</p>

# orbit-js

JavaScript/WebAssembly bindings for the [Orbit configuration language](https://github.com/orbit-format/orbit). Use `orbit-js` to parse, evaluate, and serialize Orbit documents directly from Node.js or any modern runtime with WebAssembly support.

## Installation

```sh
# with pnpm (recommended)
pnpm add orbit-js

# or with npm / yarn
npm install orbit-js
yarn add orbit-js
```

`orbit-js` ships as an ESM-only package and requires Node.js 18+ (or an equivalent browser/bundler environment with `fetch` and WebAssembly enabled).

## Quick start

```ts
import { createOrbit } from "orbit-js";

const orbit = await createOrbit();
const value = orbit.evaluate(`
app {
  name: "orbit"
  features: ["wasm", "type-safe"]
}
`);

console.log(value.app.name); // "orbit"
```

During installation the package downloads a matching `orbit_core.wasm` artifact from the Orbit release that corresponds to the npm package version. No local Rust toolchain is required.

## Runtime compatibility

- Node.js – Works out of the box. When `orbit.evaluate` receives a string it first tries to load it as a file path using synchronous `fs` calls; pass `{ source: "..." }` to skip the heuristic.
- Modern browsers / bundlers – Provide the wasm bytes (see [Custom wasm loading](#custom-wasm-loading)) or rely on the default relative URL import (`../wasm/orbit_core.wasm`). Ensure the asset ships with your bundle.
- Edge runtimes (Deno, Cloudflare Workers, etc.) – Supply a custom `fetch`, `binary`, or `instantiate` option if the default filesystem/fetch APIs are not available.

## API overview

### `createOrbit(options?: OrbitInitOptions): Promise<OrbitCore>`

Creates a ready-to-use `OrbitCore` instance by instantiating the wasm module. Useful options include:

- `binary` – A `BufferSource` containing wasm bytes you already fetched.
- `module` – A precompiled `WebAssembly.Module` to reuse across workers.
- `url` – Override the URL used to fetch the wasm asset (defaults to `../wasm/orbit_core.wasm`).
- `imports` – Additional import object to merge into the wasm instance.
- `instantiate` – Fully control instantiation by returning `WebAssembly.instantiate` output yourself.

```ts
const orbit = await createOrbit({
  url: new URL("/static/orbit_core.wasm", import.meta.url),
});
```

### `OrbitCore` methods

| Method                           | Description                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `version()`                      | Returns the semantic version string exposed by the underlying Orbit runtime.                                                    |
| `parse(source)`                  | Produces an Orbit AST (JSON) or throws `OrbitError` on failure.                                                                 |
| `parseWithRecovery(source)`      | Returns `{ document, errors }`, allowing you to inspect partial parses together with structured diagnostics.                    |
| `evaluate(input)`                | Evaluates an Orbit document and returns the computed value (JSON). Accepts either a string or `{ source, filePath, encoding }`. |
| `evaluateAst(ast)`               | Evaluate a previously parsed AST. Useful for caching or programmatic AST transforms.                                            |
| `valueToJson(value, { pretty })` | Serializes a runtime value to JSON, optionally pretty printed.                                                                  |
| `valueToYaml(value)`             | Serializes a runtime value to YAML.                                                                                             |
| `valueToMsgpack(value)`          | Returns a `Uint8Array` containing the MsgPack representation of the value.                                                      |

All methods throw an `OrbitError` when the wasm runtime returns a non-success status. The error exposes a `detail` object with `kind`, `message`, and `span` fields to help you surface rich diagnostics to end users.

## Evaluating sources from disk

When running inside Node.js you can pass a file path directly to `evaluate`:

```ts
orbit.evaluate("./config/app.orbit");
```

To avoid ambiguity between literal source strings and file paths, pass an object:

```ts
orbit.evaluate({ source: 'app { name: "orbit" }' });
orbit.evaluate({ filePath: "./config/app.orbit", encoding: "utf8" });
```

File-backed evaluation is only available in environments where synchronous filesystem access exists. Browser builds must always pass the source text explicitly.

## Serializing values

Orbit runtime values can be losslessly converted into multiple interchange formats:

```ts
const ast = orbit.parse("app { replicas: 3 }");
const result = orbit.evaluateAst(ast);

const prettyJson = orbit.valueToJson(result, { pretty: true });
const yaml = orbit.valueToYaml(result);
const msgpackBytes = orbit.valueToMsgpack(result);
```

`valueToMsgpack` returns a `Uint8Array` that you can forward directly to storage layers, network sockets, or other MsgPack-aware systems.

## Custom wasm loading

The npm package bundles `wasm/orbit_core.wasm` and points `createOrbit` at it by default. You can override this behavior when integrating with custom pipelines:

```ts
import wasmBytes from "./vendor/orbit_core.wasm?arraybuffer";

const orbit = await createOrbit({
  binary: wasmBytes,
  imports: {
    env: {
      /* custom host functions */
    },
  },
});
```

- Set `ORBIT_WASM_TAG` before installation to pin the helper script to a specific Orbit release tag (e.g., `ORBIT_WASM_TAG=nightly-2024-12-01`).
- Provide `url` when the wasm asset lives on a CDN or is injected by your framework.
- Use `instantiate` if your environment requires specialized streaming instantiation or caching.

## Error handling

All runtime failures surface as `OrbitError` instances. Inspect `error.detail` for a structured description:

```ts
try {
  orbit.evaluate("app { ports: [80, ");
} catch (error) {
  if (error instanceof OrbitError) {
    console.error(
      `${error.detail.kind} at ${error.detail.span.start}-${error.detail.span.end}`,
    );
  }
}
```

Use `parseWithRecovery` when you need to continue past recoverable syntax errors and display inline diagnostics.

## Developing locally

Clone the repo, install dependencies, and run the build/test scripts:

```sh
pnpm install
pnpm run build
pnpm run test
```

`pnpm run build` compiles TypeScript to `dist/` and ensures the wasm artifact is present. `pnpm run test` executes the Vitest suite. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Community

- [Contributing guide](CONTRIBUTING.md)
- [Pull request guide](docs/pull_request_guide.md)
- [Security policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## License

BSD-3-Clause © The Orbit Authors
