/**
 * Shared UI Constants
 *
 * Animation, button-state, and scroll-threshold constants.
 * Available through the `@ui-constants` alias.
 */

/** Default GSAP animation duration (seconds). */
export const DEFAULT_DURATION = 0.3;

/** Slide animation distance (px). */
export const SLIDE_DISTANCE = 30;

/** Button success-state display duration (ms). */
export const DEFAULT_SUCCESS_DURATION = 1500;

/** Button error-state display duration (ms). */
export const DEFAULT_ERROR_DURATION = 2000;

/** Minimum splash-screen display duration (ms). */
export const MINIMUM_DISPLAY_TIME = 2000;

/** Splash-screen hide animation duration (ms) — matches CSS `--duration-slow`. */
export const HIDE_ANIMATION_DURATION = 400;

/** Bottom-scroll threshold (px) — treated as "at bottom" within this distance from the container edge. */
export const SCROLL_THRESHOLD = 80;
