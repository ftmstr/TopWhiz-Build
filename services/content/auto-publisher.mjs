import { assessPublishableContent } from "./publish-policy.mjs";

/**
 * A single intake contract for automated editorial/catalog workflows.
 * The submitter/AI NEVER supplies trustedContext.
 *
 * Adapter contracts:
 * reviewer.resolveTrust(content): server-verified rights, source, media and fact attestations
 * repository.stage(content, assessment): durable quarantine/review record
 * repository.publishApproved(content, approvedRoutes): atomic approved content + audit
 * notifier.invalidate(approvedRoutes): invalidate cache only after durable publish
 *
 * No production adapter is connected here; no public publishing endpoint exists.
 */
export async function ingestAndRoute(content, {reviewer, repository, notifier, now = new Date()}) {
  if (!reviewer || !repository || !notifier ||
      typeof reviewer.resolveTrust !== "function" ||
      typeof repository.stage !== "function" ||
      typeof repository.publishApproved !== "function" ||
      typeof notifier.invalidate !== "function") throw Error("trusted_adapters_required");
  const trusted = await reviewer.resolveTrust(content);
  const assessment = assessPublishableContent(content, trusted, now);
  const staged = await repository.stage(content, assessment);
  if (!staged || !staged.id) throw Error("durable_staging_required");
  if (assessment.status !== "ready_for_auto_publish") {
    return {status:"quarantined", stagingId:staged.id, failures:assessment.failures, routes:[]};
  }
  // Publication permissions belong only to a separately credentialed backend adapter.
  const outcome = await repository.publishApproved({
    stagingId:staged.id, content, routes:assessment.destinations, reviewedRights:trusted
  });
  if (!outcome || !outcome.version) throw Error("publication_transaction_required");
  await notifier.invalidate(assessment.destinations);
  return {status:"published", stagingId:staged.id,
    version:outcome.version, routes:assessment.destinations};
}
