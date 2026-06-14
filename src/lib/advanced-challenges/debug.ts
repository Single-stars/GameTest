export function getDebugToolsVisibility({
  adminAuthorized,
  nodeEnv,
  search,
}: {
  adminAuthorized?: boolean;
  nodeEnv?: string;
  search?: string;
}) {
  if (nodeEnv === "development") return true;
  const params = new URLSearchParams((search ?? "").replace(/^\?/, ""));
  return params.get("debug") === "1" && params.get("debugAdmin") === "1" && adminAuthorized === true;
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
