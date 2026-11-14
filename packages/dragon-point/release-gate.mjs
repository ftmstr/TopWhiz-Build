/**
 * Dragon Point production admission gate.
 *
 * This is deliberately separate from the deterministic scoring engine:
 * a numerically calculable score is NOT evidence of publication rights.
 * No caller supplied property can bypass an unapproved methodology.
 */
import { DRAGON_METHOD, METRICS } from "./engine.mjs";

const REVIEW_REQUIRED = Object.freeze([
  "DRAFT_METHODOLOGY",
  "UNAPPROVED_REFERENCE_ANCHORS",
  "RIGHTS_REVIEW_UNVERIFIED",
  "PRODUCTION_RELEASE_NO_GO"
]);
const CATEGORY_NAMES = Object.freeze({
  performance:"Performans",camera:"Kamera",display:"Ekran",
  battery:"Batarya ve şarj",software:"Yazılım ve güncelleme",
  connectivity:"Bağlantı",design:"Tasarım ve dayanıklılık",
  audio:"Ses ve kullanım"
});

/**
 * Read-only certificate. Does not consume trust flags, email approvals,
 * client assertions, or draft PR states. Real production admission requires
 * an independently implemented server-side approval system and resolved GO gates.
 */
export function assessDragonPointReadiness() {
  const uncalibrated = METRICS.filter(m => !m.calibration).map(m => m.id);
  const preliminary = METRICS.filter(m => m.calibration).map(m => m.id);
  const total = METRICS.reduce((sum,m) => sum+m.weight,0);
  const weightsValid = total === DRAGON_METHOD.maximum &&
    Object.entries(DRAGON_METHOD.categoryWeights).every(([category,w]) =>
      METRICS.filter(m=>m.category===category).reduce((sum,m)=>sum+m.weight,0)===w);
  const blockers = [
    ...(DRAGON_METHOD.status !== "APPROVED" ? ["DRAFT_METHODOLOGY"] : []),
    ...(uncalibrated.length ? ["UNCALIBRATED_METRICS"] : []),
    ...(preliminary.length ? ["UNAPPROVED_REFERENCE_ANCHORS"] : []),
    ...REVIEW_REQUIRED.filter(x => x !== "DRAFT_METHODOLOGY" && x !== "UNAPPROVED_REFERENCE_ANCHORS"),
    ...(!weightsValid ? ["INVALID_CATEGORY_WEIGHTS"] : [])
  ];
  // Even if the draft score registry is eventually fully calibrated,
  // release requires separate independently verified authority/rights gates.
  return Object.freeze({
    methodologyVersion: DRAGON_METHOD.version,
    status:"BLOCKED",
    releaseReady:false,
    publicRankingPermitted:false,
    maximum:DRAGON_METHOD.maximum,
    totalMetrics:METRICS.length,
    requiredCalibratedMetrics:METRICS.length,
    uncalibratedMetrics:Object.freeze(uncalibrated),
    preliminaryMetrics:Object.freeze(preliminary),
    categoryWeights:DRAGON_METHOD.categoryWeights,
    categoryNames:CATEGORY_NAMES,
    blockers:Object.freeze(blockers)
  });
}

/** Always fail closed on real pages while release certification is blocked. */
export function presentDragonPoint(_candidate) {
  const ready=assessDragonPointReadiness();
  return Object.freeze({
    status:"UNAVAILABLE",
    showNumericScore:false,
    totalScore:null,
    label:"Veri bekleniyor",
    methodologyVersion:ready.methodologyVersion,
    maximum:ready.maximum,
    releaseReady:false,
    categoryWeights:ready.categoryWeights,
    categoryNames:ready.categoryNames
  });
}
