import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { OrbitCore, OrbitError, createOrbit } from "../src/index.js";

describe("orbit-js bindings", () => {
  let orbit: OrbitCore;

  beforeAll(async () => {
    orbit = await createOrbit();
  });

  it("evaluates Orbit documents into plain data", () => {
    const value = orbit.evaluate(`
      app {
        name: "orbit"
        features: ["parser", "runtime"]
      }
    `) as Record<string, unknown>;

    expect(value).toMatchObject({
      app: {
        name: "orbit",
        features: ["parser", "runtime"],
      },
    });
  });

  it("reads Orbit sources from file paths when requested", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "orbit-js-"));
    const filePath = join(tempDir, "config.orbit");
    writeFileSync(
      filePath,
      `app {\n        name: "from disk"\n        flags: ["cli"]\n      }`,
    );

    const value = orbit.evaluate(filePath) as Record<string, unknown>;

    expect(value).toMatchObject({
      app: {
        name: "from disk",
        flags: ["cli"],
      },
    });
  });

  it("surfaces parse errors with spans", () => {
    expect(() => orbit.parse("app {")).toThrow(OrbitError);
    try {
      orbit.parse("app {");
    } catch (error) {
      if (error instanceof OrbitError) {
        expect(error.detail.span.start).toBeLessThan(error.detail.span.end + 1);
      }
    }
  });

  it("serializes runtime values to yaml and msgpack", () => {
    const value = orbit.evaluate("app { version: 1 }");
    const yaml = orbit.valueToYaml(value);
    const msgpack = orbit.valueToMsgpack(value);

    expect(yaml).toContain("app");
    expect(msgpack.byteLength).toBeGreaterThan(0);
  });
});
