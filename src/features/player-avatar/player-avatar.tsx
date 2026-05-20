"use client";

import { createContext, useContext, type CSSProperties, type Ref, type ReactNode } from "react";

import styles from "./player-avatar.module.css";

export type PlayerAvatarAction =
  | "idle"
  | "move"
  | "charge"
  | "land"
  | "hit"
  | "celebrate"
  | "sleep";

export type PlayerAvatarExpression =
  | "neutral"
  | "happy"
  | "sleepy"
  | "scared"
  | "hurt";

export type PlayerAvatarEffect = "none" | "shield" | "sparkles";
export type PlayerAvatarGravity = "normal" | "light" | "heavy";
export type PlayerAvatarSize = "sm" | "md" | "lg" | number;
export type PlayerAvatarDirection = "left" | "right" | "none";
export type PlayerAvatarSkin = "cyan" | "mint" | "amber" | "rose" | "slate" | "basketball" | "pig";

export type PlayerAvatarView = {
  action: PlayerAvatarAction;
  expression: PlayerAvatarExpression;
  effect?: PlayerAvatarEffect;
};

export const PLAYER_AVATAR_SKINS = ["cyan", "mint", "amber", "rose", "slate", "basketball", "pig"] as const satisfies readonly PlayerAvatarSkin[];
export const PLAYER_AVATAR_FACELESS_SKINS = ["basketball", "pig"] as readonly PlayerAvatarSkin[];
export const PLAYER_AVATAR_ACTIONS = ["idle", "move", "charge", "land", "hit", "celebrate", "sleep"] as const satisfies readonly PlayerAvatarAction[];
export const PLAYER_AVATAR_EXPRESSIONS = ["neutral", "happy", "sleepy", "scared", "hurt"] as const satisfies readonly PlayerAvatarExpression[];
export const PLAYER_AVATAR_EFFECTS = ["none", "shield", "sparkles"] as const satisfies readonly PlayerAvatarEffect[];

const PlayerAvatarSkinContext = createContext<PlayerAvatarSkin>("cyan");

export function PlayerAvatarSkinProvider({
  children,
  skin,
}: {
  children: ReactNode;
  skin: PlayerAvatarSkin;
}) {
  return <PlayerAvatarSkinContext.Provider value={skin}>{children}</PlayerAvatarSkinContext.Provider>;
}

export function usePlayerAvatarSkin() {
  return useContext(PlayerAvatarSkinContext);
}

export type PlayerAvatarProps = Partial<PlayerAvatarView> & {
  gravity?: PlayerAvatarGravity;
  skin?: PlayerAvatarSkin;
  size?: PlayerAvatarSize;
  direction?: PlayerAvatarDirection;
  rotationTurns?: number;
  rotationDeg?: number;
  charge?: number;
  rootRef?: Ref<HTMLSpanElement>;
  visualScale?: number;
  active?: boolean;
  className?: string;
};

function clampAvatarUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampAvatarScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.75, Math.min(1.6, value));
}

function resolveSizeClass(size: PlayerAvatarSize) {
  if (typeof size === "number") return "";
  return styles[size];
}

function toFixedVar(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function cssEyes(): ReactNode {
  return (
    <>
      <span className={`${styles.eye} ${styles.leftEye}`} />
      <span className={`${styles.eye} ${styles.rightEye}`} />
    </>
  );
}

function renderAvatarExpression(expression: PlayerAvatarExpression): ReactNode {
  if (expression === "neutral" || expression === "hurt") return cssEyes();

  if (expression === "happy") {
    return (
      <svg className={styles.expressionSvg} viewBox="0 0 64 64" aria-hidden="true">
        <path d="M16 34 Q22 26 28 34" />
        <path d="M36 34 Q42 26 48 34" />
      </svg>
    );
  }

  if (expression === "sleepy") {
    return (
      <svg className={styles.expressionSvg} viewBox="0 0 64 64" aria-hidden="true">
        <path d="M16 42 Q22 45 28 42" />
        <path d="M36 42 Q42 45 48 42" />
      </svg>
    );
  }

  return (
    <svg className={styles.expressionSvg} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 25 L28 32 L18 39" />
      <path d="M46 25 L36 32 L46 39" />
    </svg>
  );
}

function renderAvatarSkinArt(skin: PlayerAvatarSkin): ReactNode {
  if (skin === "pig") {
    return (
      <svg className={`${styles.skinSvg} ${styles.pigSvg}`} viewBox="0 0 64 64" aria-hidden="true">
        <path className={styles.pigEye} d="M22 13 V21" />
        <path className={styles.pigEye} d="M42 13 V21" />
        <ellipse className={styles.pigNose} cx="32" cy="35" rx="24" ry="16" />
        <path className={styles.pigNostril} d="M24 30 V40" />
        <path className={styles.pigNostril} d="M40 30 V40" />
      </svg>
    );
  }

  if (skin !== "basketball") return null;

  return (
    <svg className={styles.skinSvg} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M0 32 H64" />
      <path d="M32 0 C19 16 19 48 32 64" />
      <path d="M32 0 C45 16 45 48 32 64" />
      <path d="M4 7 C17 19 47 19 60 7" />
      <path d="M4 57 C17 45 47 45 60 57" />
    </svg>
  );
}

export function PlayerAvatar({
  action = "idle",
  active = true,
  charge = 0,
  className = "",
  direction = "none",
  effect = "none",
  expression = "neutral",
  gravity = "normal",
  rotationDeg,
  rotationTurns = 0,
  rootRef,
  size = "md",
  skin,
  visualScale = 1,
}: PlayerAvatarProps) {
  const currentSkin = usePlayerAvatarSkin();
  const normalizedCharge = clampAvatarUnit(charge);
  const normalizedVisualScale = clampAvatarScale(visualScale);
  const resolvedAction = active ? action : "idle";
  const resolvedExpression = active ? expression : "neutral";
  const resolvedSkin = skin ?? currentSkin;
  const shouldRenderExpression = !PLAYER_AVATAR_FACELESS_SKINS.includes(resolvedSkin);
  const shouldRecenterForDisplay = action === "celebrate";
  const rotation = shouldRecenterForDisplay ? 0 : rotationDeg ?? rotationTurns * 90;
  const customSize = typeof size === "number" ? `${size}px` : undefined;
  const rootClassName = [styles.root, resolveSizeClass(size), className].filter(Boolean).join(" ");
  const style = {
    "--player-avatar-charge": toFixedVar(normalizedCharge),
    "--player-avatar-charge-offset": `${toFixedVar(normalizedCharge * 4)}px`,
    "--player-avatar-charge-scale-x": toFixedVar(1 + normalizedCharge * 0.18),
    "--player-avatar-charge-scale-y": toFixedVar(1 - normalizedCharge * 0.24),
    "--player-avatar-rotation": `${rotation}deg`,
    "--player-avatar-size": customSize,
    "--player-avatar-visual-scale": toFixedVar(normalizedVisualScale),
  } as CSSProperties & Record<string, string | undefined>;

  return (
    <span
      aria-hidden="true"
      className={rootClassName}
      data-action={resolvedAction}
      data-active={active ? "true" : "false"}
      data-direction={direction}
      data-effect={effect}
      data-expression={resolvedExpression}
      data-gravity={gravity}
      data-skin={resolvedSkin}
      ref={rootRef}
      style={style}
    >
      <span className={styles.visual}>
        <span className={styles.shadow} />
        <span className={styles.sparkles} />
        <span className={styles.shield} />
        <span className={styles.motion}>
          <span className={styles.rotator}>
            <span className={styles.body}>
              {renderAvatarSkinArt(resolvedSkin)}
              {shouldRenderExpression ? <span className={styles.face}>{renderAvatarExpression(resolvedExpression)}</span> : null}
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}
