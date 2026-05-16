export function getDebugToolsVisibility({
  nodeEnv,
  search,
}: {
  nodeEnv?: string;
  search?: string;
}) {
  if (nodeEnv === "development") return true;
  return new URLSearchParams((search ?? "").replace(/^\?/, "")).get("debug") === "1";
}

export function shouldShowPerfectClearShortcut({ debugToolsVisible }: { debugToolsVisible: boolean }) {
  void debugToolsVisible;
  return true;
}
