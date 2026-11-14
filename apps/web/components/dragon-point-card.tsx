import { assessDragonPointReadiness, presentDragonPoint } from "../../../packages/dragon-point/release-gate.mjs";
import { DragonPointCinematic } from "./dragon-point-cinematic";

/**
 * Server-side admission boundary: unreviewed phone records never reach the
 * animated counter. Demo scores are never supplied by the phone CMS route.
 */
export function DragonPointCard({ score }: { score?: unknown }) {
  const release=assessDragonPointReadiness();
  const view=presentDragonPoint(score);
  const categories=Object.entries(release.categoryWeights).map(([id,maxPoints])=>({
    id,
    name:release.categoryNames[id as keyof typeof release.categoryNames],
    maxPoints:Number(maxPoints)
  }));
  return <DragonPointCinematic
    mode="real"
    score={view.showNumericScore ? view.totalScore : null}
    maxScore={view.maximum}
    methodologyVersion={view.methodologyVersion}
    categories={categories}
  />;
}
