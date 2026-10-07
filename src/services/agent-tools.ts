import pages from '@/config/seo-pages.json';
import { router } from '@/routes/router';

interface BrowserTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown, options: { signal: AbortSignal }) => Promise<unknown>;
}
interface ModelContext {
  registerTool: (tool: BrowserTool, options: { signal: AbortSignal }) => Promise<void>;
}

const routes = { 'friend-parent-finder': '/database', 'affinity-lineage-planner': '/tools/lineage-planner', 'global-schedule': '/timeline' } as const;

export async function registerAgentTools(signal: AbortSignal): Promise<void> {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext ?? (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
  if (!context?.registerTool || signal.aborted) return;
  const sources = Object.entries(routes).map(([tool, path]) => ({
    tool, title: pages[path].title, description: pages[path].description, url: `https://uma.moe${path}`
  }));
  await context.registerTool({
    name: 'get_umamoe_tools',
    description: 'List uma.moe Global Umamusume tools with descriptions and canonical source URLs: friend and parent finder, affinity calculator and lineage planner, estimated banner and event schedule. Returns public metadata only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: async (_input, options) => {
      options.signal.throwIfAborted();
      return { sources };
    }
  }, { signal });
  if (signal.aborted) return;
  await context.registerTool({
    name: 'open_umamoe_tool',
    description: 'Open a uma.moe public tool in the current tab. Opens the friend and parent finder, affinity and lineage planner, or estimated Global banner and event schedule; returns its canonical source URL.',
    inputSchema: { type: 'object', properties: { tool: { type: 'string', enum: Object.keys(routes) } }, required: ['tool'], additionalProperties: false },
    execute: async (input, options) => {
      options.signal.throwIfAborted();
      if (!input || typeof input !== 'object' || !('tool' in input) || typeof input.tool !== 'string' || !Object.hasOwn(routes, input.tool) || Object.keys(input).length !== 1) throw new Error('Choose one of the published uma.moe tools.');
      const path = routes[input.tool as keyof typeof routes];
      await router.navigate(path);
      return { url: `https://uma.moe${path}`, description: pages[path].description };
    }
  }, { signal });
}
