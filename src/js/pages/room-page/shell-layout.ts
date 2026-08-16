import type { InstalledRoomRecord } from "@shared/index.js";
import { escapeHtml } from "./page-text-runtime.js";

export function shouldShowRoomFeatureStrip(
  usesImmersivePageShell: boolean,
  featureCount: number
): boolean {
  if (usesImmersivePageShell && featureCount <= 1) {
    return false;
  }
  return true;
}

export function ensureRoomPageShell(
  page: HTMLElement,
  options: {
    immersive: boolean;
    showFeatureStrip: boolean;
    onSelectFeature: (featureId: string) => void;
  }
): void {
  if (page.dataset["roomShellReady"] === "true") {
    return;
  }

  const classicShellMarkup = options.immersive
    ? `
      <div class="room-shell room-shell--immersive" data-room-role="classic-shell">
        <div class="room-shell-topline"${options.showFeatureStrip ? "" : " hidden"}>
          <div class="room-feature-strip room-feature-strip--inline" data-room-role="feature-strip"></div>
        </div>
        <section class="glass-panel ds-surface-card room-shell-stage room-shell-stage--immersive">
          <div class="room-runtime-mount room-runtime-mount--stage" data-room-role="runtime-mount"></div>
        </section>
      </div>
    `
    : `
      <div class="room-shell" data-room-role="classic-shell">
        <div class="room-shell-topline"${options.showFeatureStrip ? "" : " hidden"}>
          <div class="room-feature-strip room-feature-strip--header" data-room-role="feature-strip"></div>
        </div>

        <section class="glass-panel ds-surface-card ds-surface-card--stack room-shell-panel room-shell-panel--runtime">
          <div class="room-runtime-mount" data-room-role="runtime-mount"></div>
        </section>
      </div>
    `;

  page.innerHTML = `
    <div class="room-page-shell${options.immersive ? " room-page-shell--immersive" : ""}" data-room-role="page-shell">
      <div class="room-scene-root scene-shell__surface" data-room-role="scene-root" hidden>
        <div class="room-scene-room scene-shell__room-layer" data-room-role="scene-room">
          <img class="room-scene-room__background scene-shell__cover-image" data-room-role="scene-room-background" alt="" />
          <div class="room-scene-room__characters entrance-scene__characters" data-room-role="scene-characters"></div>
          <div class="room-scene-room__back-layer" data-room-role="scene-room-back-host"></div>
          <div class="room-scene-room__hotspots" data-room-role="scene-hotspots"></div>
        </div>
        <div class="room-scene-view scene-shell__view" data-room-role="scene-view" aria-hidden="true">
          <img class="room-scene-view__background scene-shell__cover-image" data-room-role="scene-view-background" alt="" />
          <img class="room-scene-view__panel-art scene-shell__cover-image" data-room-role="scene-view-panel-art" alt="" hidden />
          <div class="room-scene-view__runtime-frame" data-room-role="scene-runtime-slot"></div>
          <div class="room-scene-view__back-layer" data-room-role="scene-back-host"></div>
        </div>
      </div>
      <div class="entrance-scene__editor-host" data-room-role="scene-editor-host"></div>

      ${classicShellMarkup}
    </div>
  `;

  page
    .querySelector<HTMLElement>("[data-room-role='feature-strip']")
    ?.addEventListener("click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
        "[data-room-feature-id]"
      );
      const featureId = button?.dataset["roomFeatureId"] ?? "";
      if (featureId !== "") {
        options.onSelectFeature(featureId);
      }
    });

  page.dataset["roomShellReady"] = "true";
}

export function renderRoomFeatureButtons(options: {
  page: HTMLElement;
  room: InstalledRoomRecord;
  activeFeatureId: string | null;
  showFeatureStrip: boolean;
}): void {
  const strip = options.page.querySelector<HTMLElement>("[data-room-role='feature-strip']");
  if (strip === null) {
    return;
  }

  if (!options.showFeatureStrip) {
    strip.innerHTML = "";
    strip.hidden = true;
    return;
  }

  strip.hidden = false;
  strip.innerHTML = options.room.features
    .map((feature) => {
      const selected = feature.id === options.activeFeatureId;
      return [
        `<button class="btn btn-sm ${selected ? "btn-primary" : "btn-ghost"} room-feature-chip"`,
        ` type="button" data-room-feature-id="${escapeHtml(feature.id)}"`,
        ` aria-pressed="${selected ? "true" : "false"}">`,
        `<span class="room-feature-chip__title">${escapeHtml(feature.name)}</span>`,
        "</button>",
      ].join("");
    })
    .join("");
}
