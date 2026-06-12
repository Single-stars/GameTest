"use client";

import { useEffect } from "react";

const LOCAL_ONLY_BLOCKED_SURFACES =
  process.env.NODE_ENV === "development"
    ? [
        ".homeworld-stage",
      ]
    : [];

const DEFAULT_BLOCKED_SURFACES = [
  ".app-shell-play",
  ".multiplayer-game-shell",
  ".multiplayer-level-room",
  ".play-screen",
  ".prototype-stage",
  ".test-pad",
  ".game-area",
  ".braking-panel",
  ".advanced-lobby-carousel",
  ...LOCAL_ONLY_BLOCKED_SURFACES,
].join(", ");

const DEFAULT_ALLOWED_SURFACES = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='button']",
  ".share-image-preview",
  ".donate-qr-image",
].join(", ");

function getEventElement(target: EventTarget | null) {
  return target instanceof Element ? target : null;
}

export function useBlockMobileLongPress({
  allowedSurfaces = DEFAULT_ALLOWED_SURFACES,
  blockedSurfaces = DEFAULT_BLOCKED_SURFACES,
}: {
  allowedSurfaces?: string;
  blockedSurfaces?: string;
} = {}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const mobileLongPressTouchOptions = { capture: true, passive: false } as const;
    const horizontalSwipeTouchOptions = { capture: true, passive: false } as const;
    let horizontalSwipeStart:
      | {
          x: number;
          y: number;
          blocked: boolean;
        }
      | null = null;

    const shouldBlockEarlyMobileLongPress = (target: EventTarget | null) => {
      const element = getEventElement(target);
      return !element || Boolean(element.closest(blockedSurfaces));
    };

    const shouldAllowMobileLongPress = (target: EventTarget | null) => {
      const element = getEventElement(target);
      return Boolean(element?.closest(allowedSurfaces));
    };

    const blockMobileLongPress = (event: Event) => {
      if (shouldAllowMobileLongPress(event.target)) return;
      if (event.type === "touchstart" && !shouldBlockEarlyMobileLongPress(event.target)) return;
      if (!event.cancelable) return;
      event.preventDefault();
    };

    const handleHorizontalSwipeTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        horizontalSwipeStart = null;
        return;
      }

      const element = getEventElement(event.target);
      horizontalSwipeStart = {
        x: touch.clientX,
        y: touch.clientY,
        blocked: !element || Boolean(element.closest(blockedSurfaces)),
      };
    };

    const handleHorizontalSwipeTouchMove = (event: TouchEvent) => {
      if (!horizontalSwipeStart) return;
      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - horizontalSwipeStart.x;
      const deltaY = touch.clientY - horizontalSwipeStart.y;
      const horizontalSwipeDominant = Math.abs(deltaX) > Math.abs(deltaY);
      if (!horizontalSwipeStart.blocked || !horizontalSwipeDominant || Math.abs(deltaX) < 8) return;
      if (!event.cancelable) return;
      event.preventDefault();
    };

    const resetHorizontalSwipeTouch = () => {
      horizontalSwipeStart = null;
    };

    document.addEventListener("contextmenu", blockMobileLongPress, { capture: true });
    document.addEventListener("selectstart", blockMobileLongPress, { capture: true });
    document.addEventListener("dragstart", blockMobileLongPress, { capture: true });
    document.addEventListener("touchstart", blockMobileLongPress, mobileLongPressTouchOptions);
    document.addEventListener("touchstart", handleHorizontalSwipeTouchStart, horizontalSwipeTouchOptions);
    document.addEventListener("touchmove", handleHorizontalSwipeTouchMove, horizontalSwipeTouchOptions);
    document.addEventListener("touchend", resetHorizontalSwipeTouch, { capture: true });
    document.addEventListener("touchcancel", resetHorizontalSwipeTouch, { capture: true });

    return () => {
      document.removeEventListener("contextmenu", blockMobileLongPress, { capture: true });
      document.removeEventListener("selectstart", blockMobileLongPress, { capture: true });
      document.removeEventListener("dragstart", blockMobileLongPress, { capture: true });
      document.removeEventListener("touchstart", blockMobileLongPress, mobileLongPressTouchOptions);
      document.removeEventListener("touchstart", handleHorizontalSwipeTouchStart, horizontalSwipeTouchOptions);
      document.removeEventListener("touchmove", handleHorizontalSwipeTouchMove, horizontalSwipeTouchOptions);
      document.removeEventListener("touchend", resetHorizontalSwipeTouch, { capture: true });
      document.removeEventListener("touchcancel", resetHorizontalSwipeTouch, { capture: true });
    };
  }, [allowedSurfaces, blockedSurfaces]);
}

export function MobileLongPressGuard() {
  useBlockMobileLongPress();
  return null;
}
