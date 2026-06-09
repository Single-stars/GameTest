"use client";

import { createContext, useContext, type CSSProperties, type Ref, type ReactNode } from "react";

import {
  PLAYER_AVATAR_FACELESS_SKINS,
  type PlayerAvatarSkin,
} from "./player-avatar-skin";
import styles from "./player-avatar.module.css";

export {
  PLAYER_AVATAR_FACELESS_SKINS,
  PLAYER_AVATAR_SKIN_DESCRIPTIONS,
  PLAYER_AVATAR_SKIN_LABELS,
  PLAYER_AVATAR_SKIN_UNLOCKS,
  PLAYER_AVATAR_SKINS,
  getNewlyUnlockedPlayerAvatarSkins,
  getUnlockedSkinFromAdvancedClear,
  getPlayerAvatarSkinUnlockState,
  isPlayerAvatarSkinUnlocked,
  resolvePlayerAvatarSkin,
  type PlayerAvatarSkin,
} from "./player-avatar-skin";

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

export type PlayerAvatarEffect = "none" | "shield" | "sparkles" | "question" | "wind";
export type PlayerAvatarGravity = "normal" | "light" | "heavy";
export type PlayerAvatarSize = "sm" | "md" | "lg" | number;
export type PlayerAvatarDirection = "left" | "right" | "none";

export type PlayerAvatarView = {
  action: PlayerAvatarAction;
  expression: PlayerAvatarExpression;
  effect?: PlayerAvatarEffect;
};
export const PLAYER_AVATAR_ACTIONS = ["idle", "move", "charge", "land", "hit", "celebrate", "sleep", "wonder"] as const satisfies readonly PlayerAvatarAction[];
export const PLAYER_AVATAR_EXPRESSIONS = ["neutral", "happy", "sleepy", "scared", "hurt"] as const satisfies readonly PlayerAvatarExpression[];
export const PLAYER_AVATAR_EFFECTS = ["none", "shield", "sparkles", "question", "wind"] as const satisfies readonly PlayerAvatarEffect[];

const PlayerAvatarSkinContext = createContext<PlayerAvatarSkin>("cyan");
const PlayerAvatarCustomImageContext = createContext<string | null>(null);
const PlayerAvatarCustomOutlineContext = createContext<string | null>(null);

export function PlayerAvatarSkinProvider({
  children,
  customImageUrl = null,
  customOutlineColor = null,
  skin,
}: {
  children: ReactNode;
  customImageUrl?: string | null;
  customOutlineColor?: string | null;
  skin: PlayerAvatarSkin;
}) {
  return (
    <PlayerAvatarSkinContext.Provider value={skin}>
      <PlayerAvatarCustomImageContext.Provider value={customImageUrl}>
        <PlayerAvatarCustomOutlineContext.Provider value={customOutlineColor}>{children}</PlayerAvatarCustomOutlineContext.Provider>
      </PlayerAvatarCustomImageContext.Provider>
    </PlayerAvatarSkinContext.Provider>
  );
}

export function usePlayerAvatarSkin() {
  return useContext(PlayerAvatarSkinContext);
}

export function usePlayerAvatarCustomImage() {
  return useContext(PlayerAvatarCustomImageContext);
}

export function usePlayerAvatarCustomOutline() {
  return useContext(PlayerAvatarCustomOutlineContext);
}

export type PlayerAvatarProps = Partial<PlayerAvatarView> & {
  gravity?: PlayerAvatarGravity;
  skin?: PlayerAvatarSkin;
  customImageUrl?: string | null;
  customOutlineColor?: string | null;
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
  if (skin === "signal") {
    return (
      <svg className={`${styles.skinSvg} ${styles.signalGlyph}`} viewBox="0 0 64 64" aria-hidden="true">
        <circle className={styles.signalHalo} cx="32" cy="32" r="14" />
        <circle className={styles.signalDot} cx="17" cy="16" r="5" />
        <circle className={styles.signalDot} cx="32" cy="13" r="5" />
        <circle className={styles.signalDot} cx="47" cy="16" r="5" />
        <circle className={styles.signalDot} cx="12" cy="32" r="5" />
        <circle className={styles.signalDot} cx="52" cy="32" r="5" />
        <circle className={styles.signalDot} cx="17" cy="48" r="5" />
        <circle className={styles.signalDot} cx="32" cy="51" r="5" />
        <circle className={styles.signalDot} cx="47" cy="48" r="5" />
      </svg>
    );
  }

  if (skin === "target") {
    return (
      <svg className={`${styles.skinSvg} ${styles.targetGlyph}`} viewBox="0 0 64 64" aria-hidden="true">
        <circle className={styles.targetRing} cx="32" cy="32" r="20" />
        <circle className={styles.targetRing} cx="32" cy="32" r="11" />
        <path className={styles.targetCrosshair} d="M32 8 V19 M32 45 V56 M8 32 H19 M45 32 H56" />
        <circle className={styles.targetCenter} cx="32" cy="32" r="4.5" />
      </svg>
    );
  }

  if (skin === "blade") {
    return (
      <svg className={`${styles.skinSvg} ${styles.bladeGlyph}`} viewBox="0 0 64 64" aria-hidden="true">
        <path className={styles.bladeSlash} d="M14 49 L47 16" />
        <path className={styles.bladeSlash} d="M26 54 L54 26" />
        <path className={styles.bladeShine} d="M22 42 L41 23" />
        <path className={styles.bladeChip} d="M43 16 L50 14 L48 21" />
      </svg>
    );
  }

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

  if (skin === "starfall") {
    return (
      <svg className={`${styles.skinSvg} ${styles.starfallGlyph}`} viewBox="0 0 64 64" aria-hidden="true">
        <g className={`${styles.starfallMeteor} ${styles.starfallMeteorOne}`}>
          <path className={styles.starfallStar} d="M19 18 Q21 12.7 23.5 18 Q29.1 18.4 24.8 22.1 Q26.2 27.5 21.4 24.4 Q16.8 27.4 18.1 22.1 Q13.9 18.4 19 18 Z" />
        </g>
        <g className={`${styles.starfallMeteor} ${styles.starfallMeteorTwo}`}>
          <path className={styles.starfallStar} d="M47 17 Q49.5 10.7 52.4 17 Q59 17.4 54 21.9 Q55.6 28.2 50.1 24.6 Q44.6 28 46.2 21.9 Q41.1 17.4 47 17 Z" />
        </g>
        <g className={`${styles.starfallMeteor} ${styles.starfallMeteorThree}`}>
          <path className={styles.starfallStar} d="M20 45 Q22.1 39.5 24.7 45 Q30.4 45.4 26 49.2 Q27.4 54.7 22.5 51.5 Q17.8 54.6 19.1 49.2 Q14.7 45.4 20 45 Z" />
        </g>
        <g className={`${styles.starfallMeteor} ${styles.starfallMeteorFour}`}>
          <path className={styles.starfallStar} d="M51 35 Q52.8 30.1 55.1 35 Q60.2 35.4 56.3 38.8 Q57.6 43.7 53.3 40.9 Q49 43.7 50.2 38.8 Q46.3 35.4 51 35 Z" />
        </g>
        <g className={`${styles.starfallMeteor} ${styles.starfallMeteorFive}`}>
          <path className={styles.starfallStar} d="M33 34 Q35.3 28.3 38 34 Q44.1 34.4 39.4 38.5 Q40.9 44.2 35.8 40.9 Q30.8 44.1 32.2 38.5 Q27.5 34.4 33 34 Z" />
        </g>
        <g className={`${styles.starfallMeteor} ${styles.starfallMeteorSix}`}>
          <path className={styles.starfallStar} d="M8 52 Q11.2 44.4 14.7 52 Q22.4 52.6 16.5 57.7 Q18.4 65.1 11.9 60.8 Q5.5 65 7.3 57.7 Q1.5 52.6 8 52 Z" />
        </g>
        <g className={`${styles.starfallMeteor} ${styles.starfallMeteorSeven}`}>
          <path className={styles.starfallStar} d="M39 51 Q41.1 45.7 43.7 51 Q49.2 51.4 45 55.1 Q46.3 60.5 41.7 57.4 Q37.1 60.4 38.4 55.1 Q34.2 51.4 39 51 Z" />
        </g>
        <g className={`${styles.starfallMeteor} ${styles.starfallMeteorEight}`}>
          <path className={styles.starfallStar} d="M9 5 Q11.6 -1.8 14.8 5 Q22 5.5 16.5 10.3 Q18.2 17.1 12.3 13.2 Q6.5 17 8.1 10.3 Q2.7 5.5 9 5 Z" />
        </g>
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

  if (skin === "relay") {
    return (
      <svg className={`${styles.skinSvg} ${styles.relayGlyph}`} viewBox="0 0 64 64" aria-hidden="true">
        <path className={styles.relayPulse} d="M13 18 Q7 32 13 46" />
        <path className={styles.relayPulse} d="M51 18 Q57 32 51 46" />
        <path className={styles.relayEnvelope} d="M17 23 H47 V45 H17 Z" />
        <path className={styles.relayEnvelopeFold} d="M18 24 L32 36 L46 24 M18 44 L28 34 M46 44 L36 34" />
        <path className={styles.relayArrow} d="M39 15 H50 M46 11 L50 15 L46 19" />
      </svg>
    );
  }

  if (skin === "lead") {
    return (
      <svg className={`${styles.skinSvg} ${styles.leadGlyph}`} viewBox="0 0 64 64" aria-hidden="true">
        <path className={styles.leadTrail} d="M13 47 H22 M10 38 H26 M13 29 H21" />
        <path className={styles.leadStep} d="M24 46 V38 H34 V30 H44 V21 H53" />
        <path className={styles.leadFlagPole} d="M44 16 V41" />
        <path className={styles.leadFlag} d="M44 17 Q51 13 56 18 Q51 24 44 21 Z" />
        <path className={styles.leadSpark} d="M22 16 L25 21 L20 21 Z" />
      </svg>
    );
  }

  if (skin === "mastery") {
    return (
      <svg className={`${styles.skinSvg} ${styles.masteryGlyph}`} viewBox="0 0 64 64" aria-hidden="true">
        <path className={styles.masteryLoop} d="M16 33 C22 20 29 20 32 32 C35 44 42 44 48 31" />
        <path className={styles.masteryLoop} d="M16 31 C22 44 29 44 32 32 C35 20 42 20 48 33" />
        <circle className={styles.masteryCore} cx="32" cy="32" r="7" />
        <circle className={styles.masteryNode} cx="32" cy="11" r="3.1" />
        <circle className={styles.masteryNode} cx="47" cy="17" r="3.1" />
        <circle className={styles.masteryNode} cx="53" cy="32" r="3.1" />
        <circle className={styles.masteryNode} cx="47" cy="47" r="3.1" />
        <circle className={styles.masteryNode} cx="32" cy="53" r="3.1" />
        <circle className={styles.masteryNode} cx="17" cy="47" r="3.1" />
        <circle className={styles.masteryNode} cx="11" cy="32" r="3.1" />
        <circle className={styles.masteryNode} cx="17" cy="17" r="3.1" />
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

export function PlayerAvatar(props: PlayerAvatarProps) {
  const {
    action = "idle",
    active = true,
    charge = 0,
    className = "",
    customImageUrl,
    customOutlineColor,
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
  } = props;
  const currentSkin = usePlayerAvatarSkin();
  const currentCustomImageUrl = usePlayerAvatarCustomImage();
  const currentCustomOutlineColor = usePlayerAvatarCustomOutline();
  const hasCustomImageUrlProp = Object.prototype.hasOwnProperty.call(props, "customImageUrl");
  const hasCustomOutlineColorProp = Object.prototype.hasOwnProperty.call(props, "customOutlineColor");
  const hasExplicitSkinProp = skin !== undefined;
  const normalizedCharge = clampAvatarUnit(charge);
  const normalizedVisualScale = clampAvatarScale(visualScale);
  const resolvedAction = active ? action : "idle";
  const resolvedExpression = active ? expression : "neutral";
  const resolvedSkin = skin ?? currentSkin;
  const resolvedCustomImageUrl =
    resolvedSkin === "custom" ? (hasExplicitSkinProp && hasCustomImageUrlProp ? customImageUrl ?? null : currentCustomImageUrl) : null;
  const resolvedCustomOutlineColor =
    resolvedSkin === "custom" ? (hasExplicitSkinProp && hasCustomOutlineColorProp ? customOutlineColor ?? null : currentCustomOutlineColor) : null;
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
    "--player-avatar-custom-image": resolvedCustomImageUrl ? `url("${resolvedCustomImageUrl}")` : undefined,
    "--player-avatar-custom-outline": resolvedCustomOutlineColor ?? undefined,
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
        <span className={styles.wind} />
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
