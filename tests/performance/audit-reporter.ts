import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Reporter, TestCase, TestResult, FullConfig } from '@playwright/test/reporter';
import type { InteractionSample } from '../e2e/fixtures/interaction-audit';

export default class AuditReporter implements Reporter {
  private outputDir = '';
  private workflows: {
    test: string;
    project: string;
    status: string;
    errors: string[];
    annotations: TestCase['annotations'];
    measured: InteractionSample[];
    completions: { label: string; ms: number }[];
  }[] = [];

  onBegin(config: FullConfig) {
    this.outputDir = config.projects[0]!.outputDir;
    mkdirSync(`${this.outputDir}/workflows`, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const measured = result.attachments
      .filter((value) => value.name === 'interaction-audit')
      .flatMap((attachment) => {
        const data =
          attachment.body ?? (attachment.path ? readFileSync(attachment.path) : undefined);

        return data ? JSON.parse(data.toString()).measured : [];
      });

    const completion = result.attachments.find((value) => value.name === 'interaction-metrics');
    const completionData =
      completion?.body ?? (completion?.path ? readFileSync(completion.path) : undefined);

    this.workflows.push({
      test: test.titlePath().slice(2).join(' > '),
      project: test.parent.project()!.name,
      status: result.status,
      errors: result.errors.map((error) =>
        (error.message ?? error.value ?? '').replace(/\x1b\[[0-9;]*m/g, '')
      ),
      annotations: test.annotations,
      measured,
      completions: completionData ? (JSON.parse(completionData.toString()).completions ?? []) : []
    });

    // Keep completed measurements even if a long Windows run is interrupted.
    writeFileSync(
      `${this.outputDir}/workflows/${test.id}.json`,
      JSON.stringify(this.workflows.at(-1))
    );
    const slow = this.workflows.at(-1)!.measured.filter((sample) => sample.duration > 300);
    if (slow.length)
      console.log(
        `  >300ms: ${slow.map((sample) => `${sample.control} (${sample.duration}ms)`).join('; ')}`
      );
  }

  onEnd() {
    const controls = new Map<
      string,
      {
        project: string;
        route: string;
        scope: string;
        control: string;
        samples: number;
        maxMs: number;
        overBudget: number;
      }
    >();

    for (const workflow of this.workflows)
      for (const sample of workflow.measured) {
        const key = JSON.stringify([workflow.project, sample.route, sample.scope, sample.control]);
        const control = controls.get(key) ?? {
          project: workflow.project,
          route: sample.route,
          scope: sample.scope,
          control: sample.control,
          samples: 0,
          maxMs: 0,
          overBudget: 0
        };

        control.samples++;
        control.maxMs = Math.max(control.maxMs, sample.duration);
        if (sample.duration > 300) control.overBudget++;
        controls.set(key, control);
      }

    const summary = [...controls.values()].sort((a, b) => b.maxMs - a.maxMs);
    const path = `${this.outputDir}/summary.json`;
    mkdirSync(this.outputDir, { recursive: true });
    writeFileSync(
      path,
      JSON.stringify(
        {
          budgetMs: 300,
          cpu: Number(process.env.PERF_CPU ?? 8),
          controls: summary,
          workflows: this.workflows
        },
        null,
        2
      )
    );

    console.log(
      `\nInteraction audit: ${summary.length} measured controls, ${summary.filter((value) => value.overBudget).length} exceeded 300ms. ${path}`
    );
  }
}
