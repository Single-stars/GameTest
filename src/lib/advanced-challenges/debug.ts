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

export function shouldShowHomeworldEntry({
  nodeEnv,
  search,
}: {
  nodeEnv?: string;
  search?: string;
}) {
  void search;
  return nodeEnv === "development";
}

export function shouldShowPerfectClearShortcut({ debugToolsVisible }: { debugToolsVisible: boolean }) {
  return debugToolsVisible;
}
