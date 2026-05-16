import { ROUND_DEFINITIONS } from "@/features/rounds/registry";
import { type RoundId } from "@/lib/scoring";

export type RoundConfig = {
  id: RoundId;
  title: string;
  measure: string;
  rule: string;
  action: string;
};

export const rounds: RoundConfig[] = ROUND_DEFINITIONS.map((round) => ({
  id: round.id,
  title: round.title,
  measure: round.label,
  rule: round.rule,
  action: round.action,
}));
