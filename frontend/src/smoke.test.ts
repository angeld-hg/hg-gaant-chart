import { describe, expect, it } from "vitest";
import { appTitle } from "./App.tsx";

describe("smoke", () => {
  it("names the app", () => {
    expect(appTitle()).toBe("Gantt");
  });
});
