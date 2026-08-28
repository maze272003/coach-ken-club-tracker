/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import schema from "./schema";

describe("Performance Engine Schema", () => {
  it("defines timeResults and extended trainingGoals tables", () => {
    expect(schema.tables.timeResults).toBeDefined();
    expect(schema.tables.trainingGoals).toBeDefined();
  });
});
