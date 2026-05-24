"use client";

import { useEffect } from "react";

const DEFAULT_BLOCKED_SURFACES = [
  ".app-shell-play",
  ".homeworld-stage",
  ".multiplayer-game-shell",
  ".multiplayer-level-room",
  ".play-screen",
  ".prototype-stage",
  ".test-pad",
  ".game-area",
  ".braking-panel",
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

    document.addEventListener("contextmenu", blockMobileLongPress, { capture: true });
    document.addEventListener("selectstart", blockMobileLongPress, { capture: true });
    document.addEventListener("dragstart", blockMobileLongPress, { capture: true });
    document.addEventListener("touchstart", blockMobileLongPress, mobileLongPressTouchOptions);

    return () => {
      document.removeEventListener("contextmenu", blockMobileLongPress, { capture: true });
      document.removeEventListener("selectstart", blockMobileLongPress, { capture: true });
      document.removeEventListener("dragstart", blockMobileLongPress, { capture: true });
      document.removeEventListener("touchstart", blockMobileLongPress, mobileLongPressTouchOptions);
    };
  }, [allowedSurfaces, blockedSurfaces]);
}

export function MobileLongPressGuard() {
  useBlockMobileLongPress();
  return null;
}
