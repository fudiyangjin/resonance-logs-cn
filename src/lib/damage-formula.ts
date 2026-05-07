import damageFormulaData from "$parserData/logic/DamageFormula.json";

export type DamageFormulaStatus = "hypothesis" | "validated" | "deprecated";

export type DamageFormulaTermKind =
  | "stat"
  | "mitigation"
  | "skillCoefficient"
  | "flatDamage"
  | "hitFlagMultiplier"
  | "percentMultiplier";

export type DamageFormulaScope =
  | "attacker"
  | "target"
  | "skill"
  | "hit"
  | "attacker-skill"
  | "attacker-target-skill";

export type DamageFormulaSource = {
  kind: string;
  description: string;
  lastReviewed: string;
};

export type DamageFormulaTerm = {
  label: string;
  kind: DamageFormulaTermKind;
  scope: DamageFormulaScope;
  defaultValue: number;
  contributionGroup: string;
  description: string;
  hitFlag?: string;
};

export type DamageFormulaContributionGroup = {
  label: string;
  termIds: string[];
  description: string;
};

export type DamageFormulaRuntimeEvidence = {
  currentlyCaptured: string[];
  neededForExactContribution: string[];
};

export type DamageFormulaUnmodeledTerm = {
  status: string;
  description: string;
};

export type DamageFormulaDefinition = {
  schemaVersion: number;
  id: string;
  status: DamageFormulaStatus;
  source: DamageFormulaSource;
  formula: {
    displayName: string;
    perHitExpression: string;
    encounterExpression: string;
    orderedTerms: string[];
  };
  terms: Record<string, DamageFormulaTerm>;
  contributionGroups: Record<string, DamageFormulaContributionGroup>;
  runtimeEvidence: DamageFormulaRuntimeEvidence;
  unmodeledTerms: Record<string, DamageFormulaUnmodeledTerm>;
};

export const damageFormula = damageFormulaData as DamageFormulaDefinition;

export function damageFormulaTerm(termId: string): DamageFormulaTerm | undefined {
  return damageFormula.terms[termId];
}

export function damageFormulaContributionGroup(
  groupId: string,
): DamageFormulaContributionGroup | undefined {
  return damageFormula.contributionGroups[groupId];
}

export function orderedDamageFormulaTerms(): DamageFormulaTerm[] {
  return damageFormula.formula.orderedTerms
    .map((termId) => damageFormula.terms[termId])
    .filter((term): term is DamageFormulaTerm => term !== undefined);
}
