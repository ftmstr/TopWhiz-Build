import { DRAGON_METHOD, METRICS } from "./engine.mjs";
export function calibrationBacklog() {
  return { methodologyVersion:DRAGON_METHOD.version, totalMetrics:METRICS.length,
    preliminary:[], uncalibrated:[] };
}
export function assessCalibrationCandidate(_input) {
  return {status:"REJECTED",publishable:false,calibrated:false,
    observedRange:null,reviewRequired:true,issues:["NOT_IMPLEMENTED"]};
}
