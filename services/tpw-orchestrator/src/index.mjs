/** Cloudflare Workers TPW orchestrator. Default CLOSED; never exposes public endpoint. */
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { slotForCron } from './policy.mjs';
import { executeHourly } from './hourly.mjs';
export class TPWAgentWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const {agent, slot} = event.payload || {};
    if (!['TPW1','TPW2','TPW3'].includes(agent) || !/^\d{10}$/.test(slot || '')) {
      throw new Error('UNTRUSTED_WORKFLOW_PARAMS');
    }
    return step.do('execute-' + agent + '-' + slot,
      {retries:{limit:2, delay:'30 seconds', backoff:'exponential'}},
      async () => {
        const result=await executeHourly({agent,slot,env:this.env});
        if(result.state==='DEPENDENCIES_NOT_READY')throw Error('HOURLY_DEPENDENCIES_NOT_READY');
        return result;
      });
  }
}
export default {
  async fetch() {
    return new Response('TOPWHIZ orchestrator is not a public endpoint',
      {status:404, headers:{'Cache-Control':'no-store'}});
  },
  async scheduled(event,env,ctx) {
    if (env.TPW_MODE === 'CLOSED') return;
    const s = slotForCron(event.cron,event.scheduledTime);
    ctx.waitUntil(env.TPW_AGENT_WORKFLOW.create({
      id:s.id,params:{agent:s.agent,slot:s.slot}
    }));
  }
};