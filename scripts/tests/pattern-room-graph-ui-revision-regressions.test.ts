import { startPatternRoomInstalledUi } from "./pattern-room-installed-ui-smoke.helpers.ts";
import {
  assert,
  createMinimalForgeUiEnvironment,
  createRoomInstalledCopy,
  fireEvent,
  test,
} from "./forge-room-ui-smoke.helpers.ts";

function readGraphNodeLayout(app: {
  querySelectorAll: (selector: string) => Array<{
    dataset: Record<string, string>;
    getAttribute: (name: string) => string | null;
  }>;
}): string[] {
  return app
    .querySelectorAll("[data-pattern-graph-node]")
    .map((node) => `${node.dataset["patternGraphNode"]}:${node.getAttribute("style") ?? ""}`)
    .sort();
}

void test("pattern-room relationship graph keeps deterministic layout and presentation-only zoom", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  let runtime: Awaited<ReturnType<typeof startPatternRoomInstalledUi>> | undefined;

  try {
    runtime = await startPatternRoomInstalledUi(installedCopy.rootDir);

    const boardNavigation = environment.app.querySelector(
      "[data-pattern-workspace-nav='board']"
    );
    assert.ok(boardNavigation);
    fireEvent(boardNavigation, "click");

    const graphMode = environment.app.querySelector(
      "[data-pattern-investigation-mode='graph']"
    );
    assert.ok(graphMode);
    fireEvent(graphMode, "click");

    const scene = environment.app.querySelector("[data-pattern-graph-scene='true']");
    const viewport = environment.app.querySelector("[data-pattern-graph-viewport='true']");
    const zoomValue = environment.app.querySelector("[data-pattern-graph-zoom-value='true']");
    const zoomIn = environment.app.querySelector("[data-pattern-graph-zoom='in']");
    assert.ok(scene);
    assert.ok(viewport);
    assert.ok(zoomValue);
    assert.ok(zoomIn);
    assert.equal(scene.dataset["patternGraphLayout"], "layered-v1");
    assert.equal(environment.app.querySelectorAll("[data-pattern-graph-column]").length, 3);
    assert.ok(environment.app.querySelectorAll("[data-pattern-graph-node]").length > 0);

    const edges = environment.app.querySelectorAll("[data-pattern-connection-edge]");
    const selectedEdge = edges[0];
    assert.ok(selectedEdge);
    const selectedEdgeId = selectedEdge.dataset["patternConnectionEdge"];
    assert.ok(selectedEdgeId);
    fireEvent(selectedEdge, "click");
    assert.equal(selectedEdge.ariaPressed, "true");
    assert.ok(environment.app.querySelector("[data-pattern-connection-detail='true']"));
    assert.equal(environment.app.querySelector("[data-pattern-remove-connection]"), null);

    const snapshotBeforeZoom = runtime.createSnapshot();
    assert.equal(zoomValue.textContent, "100%");
    fireEvent(zoomIn, "click");
    assert.equal(zoomValue.textContent, "125%");
    assert.match(scene.getAttribute("style") ?? "", /transform:scale\(1\.25\)/);
    assert.deepEqual(runtime.createSnapshot().overlay, snapshotBeforeZoom.overlay);

    const firstLayout = readGraphNodeLayout(environment.app);
    const boardMode = environment.app.querySelector(
      "[data-pattern-investigation-mode='board']"
    );
    assert.ok(boardMode);
    fireEvent(boardMode, "click");
    const restoredGraphMode = environment.app.querySelector(
      "[data-pattern-investigation-mode='graph']"
    );
    assert.ok(restoredGraphMode);
    fireEvent(restoredGraphMode, "click");

    const secondLayout = readGraphNodeLayout(environment.app);
    assert.deepEqual(secondLayout, firstLayout);
    assert.equal(
      environment.app.querySelector("[data-pattern-graph-zoom-value='true']")?.textContent,
      "100%"
    );
    assert.equal(
      environment.app.querySelector(
        `[data-pattern-connection-edge='${selectedEdgeId}']`
      )?.ariaPressed,
      "true"
    );
    assert.deepEqual(runtime.createSnapshot().overlay, snapshotBeforeZoom.overlay);
  } finally {
    runtime?.dispose();
    environment.runPendingTimers();
    await new Promise((resolve) => setTimeout(resolve, 0));
    environment.restore();
    await installedCopy.cleanup();
  }
});
