// ErrorBoundary.test.tsx (2026-11-14, crash-reporting item 2) — locks in
// the owner-only diagnostic line fix: componentDidCatch used to set
// `this.lastError` as a plain instance field, which runs in React's COMMIT
// phase, AFTER the fallback's one real render (driven by
// getDerivedStateFromError, in the RENDER phase) already happened - so the
// owner line was never actually on screen, even though isOwner was true.
// This test fails on the OLD code (lastError not yet set on that render)
// and passes on the fix (captured as state, in the same update that flips
// hasError).
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import ErrorBoundary from "../ErrorBoundary";

function Boom(): React.ReactElement {
  throw new Error("boom: malformed field");
}

// React logs a (expected, deliberately-triggered) error to console during
// this test - silenced so the test output stays readable.
let consoleErrorSpy: jest.SpyInstance;
beforeEach(() => { consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { consoleErrorSpy.mockRestore(); });

test("owner-only error line renders on the SAME render that shows the fallback", async () => {
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ErrorBoundary fallbackMessage="Couldn't read that one. Try again." isOwner currentScreen="scanner">
        <Boom />
      </ErrorBoundary>
    );
  });
  const texts = tree!.root.findAllByType(Text).map((n) => n.props.children);
  const flat = texts.flat(Infinity).join(" ");
  expect(flat).toContain("Couldn't read that one. Try again.");
  expect(flat).toContain("boom: malformed field");
});

test("non-owner never sees the diagnostic line, even though the fallback still renders", async () => {
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ErrorBoundary fallbackMessage="Couldn't read that one. Try again.">
        <Boom />
      </ErrorBoundary>
    );
  });
  const texts = tree!.root.findAllByType(Text).map((n) => n.props.children);
  const flat = texts.flat(Infinity).join(" ");
  expect(flat).toContain("Couldn't read that one. Try again.");
  expect(flat).not.toContain("boom: malformed field");
});
