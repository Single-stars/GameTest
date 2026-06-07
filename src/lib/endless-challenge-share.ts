import {
  sanitizeEndlessRunSnapshot,
  type EndlessRunSnapshot,
} from "./endless-run-snapshot.ts";

export type EndlessChallengePayload = {
  v: 1;
  mode: "endless-challenge";
  ownerName: string | null;
  target: EndlessRunSnapshot;
};

export type EndlessChallengeOutcome = "win" | "lose" | "draw";

const MAX_OWNER_NAME_LENGTH = 16;

function sanitizeOwnerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().slice(0, MAX_OWNER_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

function base64ToBase64Url(base64: string) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBase64(encoded: string) {
  return encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
}

function utf8ToBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa !== "undefined") return base64ToBase64Url(btoa(binary));
  if (typeof Buffer !== "undefined") return base64ToBase64Url(Buffer.from(binary, "binary").toString("base64"));
  return "";
}

function base64UrlToUtf8(encoded: string) {
  const padded = base64UrlToBase64(encoded);
  const binary = typeof atob !== "undefined" ? atob(padded) : Buffer.from(padded, "base64").toString("binary");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createEndlessChallengePayload({
  ownerName,
  target,
}: {
  ownerName: string | null;
  target: EndlessRunSnapshot;
}): EndlessChallengePayload {
  return {
    v: 1,
    mode: "endless-challenge",
    ownerName: sanitizeOwnerName(ownerName),
    target,
  };
}

export function encodeEndlessChallengePayload(payload: EndlessChallengePayload | null | undefined) {
  if (!payload) return "";
  const target = sanitizeEndlessRunSnapshot(payload.target);
  if (!target) return "";
  return utf8ToBase64Url(JSON.stringify(createEndlessChallengePayload({ ownerName: payload.ownerName, target })));
}

export function decodeEndlessChallengePayload(encoded: string | null | undefined): EndlessChallengePayload | null {
  if (typeof encoded !== "string" || encoded.length === 0) return null;
  try {
    const source = JSON.parse(base64UrlToUtf8(encoded)) as Partial<EndlessChallengePayload>;
    if (source.v !== 1 || source.mode !== "endless-challenge") return null;
    const target = sanitizeEndlessRunSnapshot(source.target);
    if (!target) return null;
    return createEndlessChallengePayload({
      ownerName: source.ownerName ?? null,
      target,
    });
  } catch {
    return null;
  }
}

export function getEndlessChallengeOutcome(challenger: EndlessRunSnapshot, target: EndlessRunSnapshot): EndlessChallengeOutcome {
  if (challenger.score > target.score) return "win";
  if (challenger.score < target.score) return "lose";
  return "draw";
}

export function getEndlessChallengeOutcomeLabel(outcome: EndlessChallengeOutcome) {
  switch (outcome) {
    case "win":
      return "轻松拿下";
    case "lose":
      return "不是对手";
    case "draw":
      return "平局";
  }
}

export function createEndlessChallengeUrl(baseUrl: string, payload: EndlessChallengePayload) {
  const url = new URL(baseUrl);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("challenge", encodeEndlessChallengePayload(payload));
  return url.toString();
}
