export function isLocalOnlyHomeworldEnabled(nodeEnv: string | undefined = process.env.NODE_ENV) {
  return nodeEnv === "development";
}

export function getProductionSafeMultiplayerPath({
  nodeEnv = process.env.NODE_ENV,
  pathname,
  search,
}: {
  nodeEnv?: string;
  pathname: string;
  search: string;
}) {
  if (isLocalOnlyHomeworldEnabled(nodeEnv)) return null;
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  if (params.get("homeworld") !== "1") return null;

  params.delete("homeworld");
  params.delete("host");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
