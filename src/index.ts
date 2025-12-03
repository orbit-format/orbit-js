const STATUS_OK = 0;
const SLICE_STRUCT_SIZE = 12;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const DEFAULT_WASM_URL = new URL("./orbit_core.wasm", import.meta.url);

let nodeFs: typeof import("node:fs") | null = null;

if (isNodeLike()) {
  nodeFs = await import("node:fs");
}

/**
 * Generic JSON-compatible value used throughout the Orbit APIs.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Alias describing the parsed Orbit AST structure.
 */
export type OrbitAst = JsonValue;
/**
 * Alias describing evaluated Orbit values.
 */
export type OrbitValue = JsonValue;

/**
 * Byte offsets describing where something appears in the original source.
 */
export interface OrbitSpan {
  start: number;
  end: number;
}

/**
 * Structured error detail reported by the WASM core.
 */
export interface OrbitJsError {
  kind: string;
  message: string;
  span: OrbitSpan;
}

/**
 * Result payload returned by `parseWithRecovery`, including a best-effort
 * document plus any parser errors that were encountered.
 */
export interface OrbitParseReport {
  document: JsonValue;
  errors: OrbitJsError[];
}

/**
 * Options accepted by `evaluate` when a string literal is not provided.
 */
export interface OrbitEvaluateOptions {
  filePath?: string;
  source?: string;
  encoding?: BufferEncoding;
}

/**
 * Valid inputs when calling `orbit.evaluate`.
 */
export type OrbitEvaluateInput = string | OrbitEvaluateOptions;

/**
 * JavaScript error wrapper that keeps the underlying Orbit error detail.
 */
export class OrbitError extends Error {
  constructor(public readonly detail: OrbitJsError) {
    super(`${detail.kind}: ${detail.message}`);
    this.name = `Orbit${detail.kind}Error`;
  }
}

interface OrbitExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  orbit_alloc(size: number): number;
  orbit_dealloc(ptr: number, len: number, cap: number): void;
  orbit_version(resultPtr: number): number;
  orbit_parse(sourcePtr: number, sourceLen: number, resultPtr: number): number;
  orbit_parse_with_recovery(
    sourcePtr: number,
    sourceLen: number,
    resultPtr: number,
  ): number;
  orbit_evaluate(
    sourcePtr: number,
    sourceLen: number,
    resultPtr: number,
  ): number;
  orbit_evaluate_ast(astPtr: number, astLen: number, resultPtr: number): number;
  orbit_value_to_json(
    valuePtr: number,
    valueLen: number,
    pretty: number,
    resultPtr: number,
  ): number;
  orbit_value_to_yaml(
    valuePtr: number,
    valueLen: number,
    resultPtr: number,
  ): number;
  orbit_value_to_msgpack(
    valuePtr: number,
    valueLen: number,
    resultPtr: number,
  ): number;
}

interface OrbitSlice {
  ptr: number;
  len: number;
  cap: number;
}

/**
 * Configuration options accepted by `createOrbit` for custom instantiation
 * scenarios (custom URLs, precompiled modules, etc.).
 */
export interface OrbitInitOptions {
  /** Raw WASM bytes that should be instantiated. */
  binary?: BufferSource;
  /** Precompiled WASM module to instantiate. */
  module?: WebAssembly.Module;
  /** URL pointing to the WASM binary. */
  url?: string | URL;
  /** Custom instantiate hook if callers need full control. */
  instantiate?: (
    imports: WebAssembly.Imports,
  ) => Promise<WebAssembly.WebAssemblyInstantiatedSource>;
  /** Additional WebAssembly imports forwarded to the module. */
  imports?: WebAssembly.Imports;
}

/**
 * High-level wrapper around the Orbit WASM exports.
 */
export class OrbitCore {
  private cachedView: DataView | null = null;
  private cachedU8: Uint8Array | null = null;

  constructor(private readonly exports: OrbitExports) {}

  /**
   * Returns the semantic version string exposed by the WASM core.
   */
  version(): string {
    return this.invoke(
      null,
      (ptr, len, resultPtr) => this.exports.orbit_version(resultPtr),
      (bytes) => this.bytesToString(bytes),
    );
  }

  /**
   * Parses Orbit source into its JSON-based AST representation.
   */
  parse(source: string): OrbitAst {
    return this.invoke(
      this.encodeString(source),
      (ptr, len, resultPtr) => this.exports.orbit_parse(ptr, len, resultPtr),
      (bytes) => this.bytesToJson(bytes),
    );
  }

  /**
   * Parses Orbit source but continues after recoverable errors, returning both
   * a document and the list of encountered issues.
   */
  parseWithRecovery(source: string): OrbitParseReport {
    return this.invoke(
      this.encodeString(source),
      (ptr, len, resultPtr) =>
        this.exports.orbit_parse_with_recovery(ptr, len, resultPtr),
      (bytes) => this.bytesToJson<OrbitParseReport>(bytes),
    );
  }

  /**
   * Evaluates Orbit source provided either directly or via file description.
   */
  evaluate(input: OrbitEvaluateInput): OrbitValue {
    const source = this.resolveEvaluateInput(input);
    return this.invoke(
      this.encodeString(source),
      (ptr, len, resultPtr) => this.exports.orbit_evaluate(ptr, len, resultPtr),
      (bytes) => this.bytesToJson(bytes),
    );
  }

  /**
   * Evaluates a previously parsed AST without re-parsing source text.
   */
  evaluateAst(ast: OrbitAst): OrbitValue {
    return this.invoke(
      this.encodeString(JSON.stringify(ast)),
      (ptr, len, resultPtr) =>
        this.exports.orbit_evaluate_ast(ptr, len, resultPtr),
      (bytes) => this.bytesToJson(bytes),
    );
  }

  /**
   * Serializes a value to JSON, optionally pretty-printing the output.
   */
  valueToJson(value: OrbitValue, options?: { pretty?: boolean }): string {
    const pretty = options?.pretty ? 1 : 0;
    return this.invoke(
      this.encodeString(JSON.stringify(value)),
      (ptr, len, resultPtr) =>
        this.exports.orbit_value_to_json(ptr, len, pretty, resultPtr),
      (bytes) => this.bytesToString(bytes),
    );
  }

  /**
   * Serializes a value to YAML format.
   */
  valueToYaml(value: OrbitValue): string {
    return this.invoke(
      this.encodeString(JSON.stringify(value)),
      (ptr, len, resultPtr) =>
        this.exports.orbit_value_to_yaml(ptr, len, resultPtr),
      (bytes) => this.bytesToString(bytes),
    );
  }

  /**
   * Serializes a value to MessagePack.
   */
  valueToMsgpack(value: OrbitValue): Uint8Array {
    return this.invoke(
      this.encodeString(JSON.stringify(value)),
      (ptr, len, resultPtr) =>
        this.exports.orbit_value_to_msgpack(ptr, len, resultPtr),
      (bytes) => bytes,
    );
  }

  private invoke<T>(
    input: Uint8Array | null,
    call: (inputPtr: number, inputLen: number, resultPtr: number) => number,
    onOk: (bytes: Uint8Array) => T,
  ): T {
    const inputSlice = this.writeInput(input);
    const resultSlicePtr = this.exports.orbit_alloc(SLICE_STRUCT_SIZE);
    if (resultSlicePtr === 0) {
      this.freeInput(inputSlice);
      throw new Error("orbit wasm could not allocate result slice");
    }

    let status = STATUS_OK;
    let payload: Uint8Array;
    try {
      status = call(inputSlice.ptr, inputSlice.len, resultSlicePtr);
      const resultSlice = this.readSlice(resultSlicePtr);
      payload = this.copySlice(resultSlice);
      this.freeBuffer(resultSlice);
    } finally {
      this.exports.orbit_dealloc(
        resultSlicePtr,
        SLICE_STRUCT_SIZE,
        SLICE_STRUCT_SIZE,
      );
      this.freeInput(inputSlice);
    }

    if (status === STATUS_OK) {
      return onOk(payload);
    }
    throw new OrbitError(this.bytesToJson<OrbitJsError>(payload));
  }

  private writeInput(bytes: Uint8Array | null): OrbitSlice {
    if (!bytes || bytes.length === 0) {
      return { ptr: 0, len: 0, cap: 0 };
    }
    const ptr = this.exports.orbit_alloc(bytes.length);
    if (ptr === 0) {
      throw new Error("orbit wasm could not allocate input buffer");
    }
    this.getUint8Memory().set(bytes, ptr);
    return { ptr, len: bytes.length, cap: bytes.length };
  }

  private freeInput(slice: OrbitSlice): void {
    if (slice.ptr !== 0) {
      this.exports.orbit_dealloc(slice.ptr, slice.len, slice.cap);
    }
  }

  private readSlice(ptr: number): OrbitSlice {
    const view = this.getDataView();
    return {
      ptr: view.getUint32(ptr, true),
      len: view.getUint32(ptr + 4, true),
      cap: view.getUint32(ptr + 8, true),
    };
  }

  private copySlice(slice: OrbitSlice): Uint8Array {
    if (slice.len === 0) {
      return new Uint8Array();
    }
    return this.getUint8Memory().slice(slice.ptr, slice.ptr + slice.len);
  }

  private freeBuffer(slice: OrbitSlice): void {
    if (slice.ptr !== 0) {
      this.exports.orbit_dealloc(slice.ptr, slice.len, slice.cap);
    }
  }

  private getUint8Memory(): Uint8Array {
    if (!this.cachedU8 || this.cachedU8.buffer !== this.exports.memory.buffer) {
      this.cachedU8 = new Uint8Array(this.exports.memory.buffer);
    }
    return this.cachedU8;
  }

  private getDataView(): DataView {
    if (
      !this.cachedView ||
      this.cachedView.buffer !== this.exports.memory.buffer
    ) {
      this.cachedView = new DataView(this.exports.memory.buffer);
    }
    return this.cachedView;
  }

  private encodeString(value: string): Uint8Array | null {
    return value.length === 0 ? null : textEncoder.encode(value);
  }

  private resolveEvaluateInput(input: OrbitEvaluateInput): string {
    if (typeof input === "string") {
      return this.tryLoadFileInput(input) ?? input;
    }

    if (typeof input.source === "string") {
      return input.source;
    }

    if (input.filePath) {
      const contents = this.tryLoadFileInput(input.filePath, input.encoding);
      if (contents !== null) {
        return contents;
      }
      if (!nodeFs) {
        throw new Error(
          "orbit.evaluate cannot read file paths in this environment",
        );
      }
      throw new Error(
        `orbit.evaluate could not read from file path: ${input.filePath}`,
      );
    }

    throw new TypeError(
      "orbit.evaluate requires a source string or options with filePath.",
    );
  }

  private tryLoadFileInput(
    filePath: string,
    encoding: BufferEncoding = "utf8",
  ): string | null {
    if (!nodeFs) {
      return null;
    }
    const trimmed = filePath.trim();
    if (trimmed.length === 0) {
      return null;
    }

    try {
      const target = trimmed.startsWith("file:") ? new URL(trimmed) : trimmed;
      if (!nodeFs.existsSync(target)) {
        return null;
      }
      return nodeFs.readFileSync(target, { encoding });
    } catch {
      return null;
    }
  }

  private bytesToString(bytes: Uint8Array): string {
    if (bytes.byteLength === 0) {
      return "";
    }
    return textDecoder.decode(bytes);
  }

  private bytesToJson<T = JsonValue>(bytes: Uint8Array): T {
    const text = this.bytesToString(bytes);
    return JSON.parse(text) as T;
  }
}

/**
 * Instantiates the Orbit WASM core and returns the high-level wrapper.
 */
export async function createOrbit(
  options?: OrbitInitOptions,
): Promise<OrbitCore> {
  const instance = await instantiateOrbit(options);
  const exports = instance.exports as OrbitExports;
  validateExports(exports);
  return new OrbitCore(exports);
}

async function instantiateOrbit(
  options?: OrbitInitOptions,
): Promise<WebAssembly.Instance> {
  const imports = options?.imports ?? {};

  if (options?.instantiate) {
    const { instance } = await options.instantiate(imports);
    return instance;
  }

  if (options?.module) {
    return WebAssembly.instantiate(options.module, imports);
  }

  if (options?.binary) {
    const bytes = bufferSourceToUint8Array(options.binary);
    const result = (await WebAssembly.instantiate(bytes, imports)) as
      | WebAssembly.WebAssemblyInstantiatedSource
      | WebAssembly.Instance;
    return "instance" in result
      ? result.instance
      : (result as WebAssembly.Instance);
  }

  const bytes = await loadWasmBytes(options?.url);
  const result = (await WebAssembly.instantiate(bytes, imports)) as
    | WebAssembly.WebAssemblyInstantiatedSource
    | WebAssembly.Instance;
  return "instance" in result
    ? result.instance
    : (result as WebAssembly.Instance);
}

function validateExports(
  exports: WebAssembly.Exports,
): asserts exports is OrbitExports {
  const required = [
    "memory",
    "orbit_alloc",
    "orbit_dealloc",
    "orbit_version",
    "orbit_parse",
    "orbit_parse_with_recovery",
    "orbit_evaluate",
    "orbit_evaluate_ast",
    "orbit_value_to_json",
    "orbit_value_to_yaml",
    "orbit_value_to_msgpack",
  ];

  for (const key of required) {
    if (!(key in exports)) {
      throw new Error(`orbit wasm is missing required export: ${key}`);
    }
  }

  if (!(exports.memory instanceof WebAssembly.Memory)) {
    throw new Error("orbit wasm did not export a WebAssembly.Memory");
  }
}

async function loadWasmBytes(urlOverride?: string | URL): Promise<Uint8Array> {
  const targetUrl = urlOverride ? normalizeUrl(urlOverride) : DEFAULT_WASM_URL;
  if (targetUrl.protocol === "file:") {
    if (isNodeLike()) {
      const { readFile } = await import("node:fs/promises");
      const data = await readFile(targetUrl);
      return new Uint8Array(data);
    }
    throw new Error(
      "File URLs are not supported in this environment. Provide wasm bytes via options.binary instead.",
    );
  }

  if (typeof fetch !== "function") {
    throw new Error(
      "Global fetch is unavailable. Provide wasm bytes via options.binary.",
    );
  }

  const response = await fetch(targetUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch wasm from ${targetUrl.toString()}: ${response.status} ${response.statusText}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

function normalizeUrl(input: string | URL): URL {
  if (input instanceof URL) {
    return input;
  }
  try {
    return new URL(input);
  } catch {
    return new URL(input, DEFAULT_WASM_URL);
  }
}

function bufferSourceToUint8Array(source: BufferSource): Uint8Array {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(
      source.buffer.slice(
        source.byteOffset,
        source.byteOffset + source.byteLength,
      ),
    );
  }
  throw new TypeError("Unsupported BufferSource value");
}

function isNodeLike(): boolean {
  return typeof process !== "undefined" && !!process.versions?.node;
}
