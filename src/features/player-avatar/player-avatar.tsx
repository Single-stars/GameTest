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
  | "sleep"
  | "wonder";

export type PlayerAvatarExpression =
  | "neutral"
  | "happy"
  | "sleepy"
  | "scared"
  | "hurt";

export type PlayerAvatarEffect = "none" | "shield" | "sparkles" | "question";
export type PlayerAvatarGravity = "normal" | "light" | "heavy";
export type PlayerAvatarSize = "sm" | "md" | "lg" | number;
export type PlayerAvatarDirection = "left" | "right" | "none";
export type PlayerAvatarSkin =
  | "cyan"
  | "mint"
  | "amber"
  | "rose"
  | "slate"
  | "basketball"
  | "pig"
  | "aqua"
  | "cocoa"
  | "sand"
  | "pine"
  | "ivory"
  | "arcade"
  | "paw";

export type PlayerAvatarView = {
  action: PlayerAvatarAction;
  expression: PlayerAvatarExpression;
  effect?: PlayerAvatarEffect;
};

export const PLAYER_AVATAR_SKINS = [
  "cyan",
  "mint",
  "amber",
  "rose",
  "slate",
  "basketball",
  "pig",
  "aqua",
  "cocoa",
  "sand",
  "pine",
  "ivory",
  "arcade",
  "paw",
] as const satisfies readonly PlayerAvatarSkin[];

export const PLAYER_AVATAR_SKIN_LABELS = {
  arcade: "手柄",
  amber: "琥珀",
  aqua: "海沫",
  basketball: "篮球",
  cocoa: "可可",
  cyan: "青蓝",
  ivory: "象牙",
  mint: "薄荷",
  paw: "猫爪",
  pig: "猪猪",
  pine: "松绿",
  rose: "玫瑰",
  sand: "沙丘",
  slate: "石板",
} as const satisfies Record<PlayerAvatarSkin, string>;

export const PLAYER_AVATAR_FACELESS_SKINS = ["basketball", "pig", "paw"] as readonly PlayerAvatarSkin[];
export const PLAYER_AVATAR_ACTIONS = ["idle", "move", "charge", "land", "hit", "celebrate", "sleep", "wonder"] as const satisfies readonly PlayerAvatarAction[];
export const PLAYER_AVATAR_EXPRESSIONS = ["neutral", "happy", "sleepy", "scared", "hurt"] as const satisfies readonly PlayerAvatarExpression[];
export const PLAYER_AVATAR_EFFECTS = ["none", "shield", "sparkles", "question"] as const satisfies readonly PlayerAvatarEffect[];

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

  if (skin === "basketball") {
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

  if (skin === "arcade") {
    return (
      <svg className={`${styles.skinSvg} ${styles.arcadeGlyph}`} viewBox="0 0 64 64" aria-hidden="true">
        <path className={styles.arcadeDpad} d="M15 43 H31 M23 35 V51" />
        <circle className={styles.arcadeButton} cx="43" cy="39" r="4" />
        <circle className={styles.arcadeButton} cx="52" cy="46" r="3.6" />
        <path className={styles.arcadeButton} d="M39 51 H51" />
      </svg>
    );
  }

  if (skin === "paw") {
    return (
      <svg className={`${styles.skinSvg} ${styles.pawGlyph}`} viewBox="0 0 64 64" aria-hidden="true">
        <ellipse className={styles.pawPad} cx="32" cy="40" rx="11" ry="9" />
        <ellipse className={styles.pawToe} cx="19" cy="27" rx="4.6" ry="5.4" />
        <ellipse className={styles.pawToe} cx="29" cy="23" rx="4.8" ry="6" />
        <ellipse className={styles.pawToe} cx="40" cy="23" rx="4.8" ry="6" />
        <ellipse className={styles.pawToe} cx="49" cy="29" rx="4.4" ry="5.2" />
      </svg>
    );
  }

  return null;
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
        <span className={styles.questionMark} />
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
