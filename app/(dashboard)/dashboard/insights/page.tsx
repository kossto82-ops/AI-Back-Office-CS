import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getUser, getTeamForUser, getCaseEventsForTeam } from '@/lib/db/queries';
import {
  BLOCK_REASON_LABELS,
  computeInsights,
  formatDuration,
  formatRate,
  type Median
} from '@/lib/insights/metrics';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PERIODS = [
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: 'all', label: 'All time', days: null }
] as const;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-medium text-gray-900">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-gray-500">{note}</p> : null}
    </div>
  );
}

function casesText(n: number): string {
  return `${n} case${n === 1 ? "" : "s"}`;
}

function medianText(m: Median): string {
  return m.n === 0 ? 'n/a' : formatDuration(m.ms);
}

export default async function InsightsPage({
  searchParams
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  const team = await getTeamForUser();
  if (!team) redirect('/sign-in');

  const requested = (await searchParams).period;
  const period = PERIODS.find((p) => p.value === requested) ?? PERIODS[1];
  const since = period.days ? new Date(Date.now() - period.days * 24 * 60 * 60 * 1000) : undefined;

  const events = await getCaseEventsForTeam(team.id, since);
  const m = computeInsights(
    events.map((e) => ({
      caseId: e.caseId,
      type: e.type,
      meta: (e.meta ?? {}) as Record<string, unknown>,
      createdAt: e.createdAt
    }))
  );

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-lg font-medium text-gray-900 lg:text-2xl">Insights</h1>
        <p className="text-sm text-gray-500">How {team.name} is using the AI assistant.</p>
      </div>

      <nav aria-label="Period" className="mb-4 flex gap-1">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/dashboard/insights?period=${p.value}`}
            aria-current={p.value === period.value ? 'page' : undefined}
            className={cn(
              'rounded-full px-3 py-1 text-sm',
              p.value === period.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      <p className="mb-6 max-w-3xl rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        These figures describe what happened in your team. Agents choose when to use the AI and
        cases are not randomized, so they do not prove time savings. Counts come from usage events
        that contain no customer or draft text.
      </p>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-500">
            No activity recorded yet for this period. Create a case and run an analysis to see
            numbers here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-700">Cases</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <Stat label="Created" value={String(m.casesCreated)} note="through intake" />
              <Stat label="Opened" value={String(m.casesOpened)} />
              <Stat label="Resolved" value={String(m.casesResolved)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-700">Time to resolve</CardTitle>
              <CardDescription>
                From first opening a case to marking it resolved. Includes time the tab was left
                open, so read the median, not an average.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <Stat label="All" value={medianText(m.handling.all)} note={casesText(m.handling.all.n)} />
              <Stat label="With AI analysis" value={medianText(m.handling.withAi)} note={casesText(m.handling.withAi.n)} />
              <Stat label="Without" value={medianText(m.handling.withoutAi)} note={casesText(m.handling.withoutAi.n)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-700">AI reliability</CardTitle>
              <CardDescription>
                Analyses that did not produce a normal result, and why.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Attempts" value={String(m.attempts)} />
                <Stat label="Not normal" value={formatRate(m.blockedRate)} />
                <Stat label="Median speed" value={medianText(m.latency)} note={`${m.latency.n} analyses`} />
              </div>
              {m.blockedByReason.length === 0 ? (
                <p className="text-sm text-gray-500">No problem analyses in this period.</p>
              ) : (
                <table className="w-full text-sm">
                  <caption className="sr-only">Analyses without a normal result by reason</caption>
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th scope="col" className="py-2 font-medium">Reason</th>
                      <th scope="col" className="py-2 text-right font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {m.blockedByReason.map((row) => (
                      <tr key={row.reason}>
                        <td className="py-2 text-gray-800">
                          {BLOCK_REASON_LABELS[row.reason] ?? row.reason}
                        </td>
                        <td className="py-2 text-right text-gray-800">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-700">How drafts are used</CardTitle>
              <CardDescription>
                A copy is the closest signal that a draft was useful; it is not proof it was sent.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Stat label="Drafts copied" value={String(m.copies)} />
              <Stat label="Copied unedited" value={formatRate(m.copiedUnedited)} />
              <Stat label="Re-run rate" value={formatRate(m.rerunRate)} note="of successful analyses" />
              <Stat
                label="Held drafts used"
                value={formatRate(m.heldCopied)}
                note="held for review, then copied"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
