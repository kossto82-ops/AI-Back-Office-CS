import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Inbox, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  getUser,
  getTeamForUser,
  getCasesForTeam,
  type CaseListFilter
} from '@/lib/db/queries';
import { caseCategoryLabel, caseStatusLabel } from '@/lib/db/case-categories';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC'
});

function formatDate(date: Date | string): string {
  return dateFormatter.format(new Date(date));
}

const statusClass: Record<string, string> = {
  queued: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800'
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        statusClass[status] ?? 'bg-gray-100 text-gray-700'
      )}
    >
      {caseStatusLabel(status)}
    </span>
  );
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) {
    return <span className="text-sm text-gray-500">Unclassified</span>;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
      {caseCategoryLabel(category)}
    </span>
  );
}

const urgencyClass: Record<string, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-gray-100 text-gray-700'
};

function UrgencyBadge({ urgency }: { urgency: string | null | undefined }) {
  if (!urgency) {
    return <span className="text-sm text-gray-500">{'—'}</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        urgencyClass[urgency] ?? 'bg-gray-100 text-gray-700'
      )}
    >
      {urgency}
    </span>
  );
}

function formatConfidence(confidence: number | null): string {
  if (confidence === null || Number.isNaN(confidence)) {
    return '—';
  }
  return `${Math.round(confidence * 100)}%`;
}

const FILTERS: Array<{ value: CaseListFilter; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' }
];

function parseFilter(value: string | undefined): CaseListFilter {
  return value === 'resolved' || value === 'all' ? value : 'open';
}

export default async function CasesPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const team = await getTeamForUser();
  if (!team) {
    redirect('/sign-in');
  }

  const filter = parseFilter((await searchParams).status);
  const cases = await getCasesForTeam(team.id, filter);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
            Cases
          </h1>
          <p className="text-sm text-gray-500">
            {cases.length} {filter === 'all' ? '' : `${filter} `}case
            {cases.length === 1 ? '' : 's'} for {team.name}
          </p>
        </div>
        <Button
          asChild
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Link href="/dashboard/cases/new">
            <Plus className="mr-2 h-4 w-4" />
            New case
          </Link>
        </Button>
      </div>

      <nav aria-label="Case status filter" className="mb-4 flex gap-1">
        {FILTERS.map((item) => (
          <Link
            key={item.value}
            href={
              item.value === 'open'
                ? '/dashboard/cases'
                : `/dashboard/cases?status=${item.value}`
            }
            aria-current={filter === item.value ? 'page' : undefined}
            className={cn(
              'rounded-full px-3 py-1 text-sm',
              filter === item.value
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <Card className="overflow-hidden">
        {cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Inbox className="h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">
              {filter === 'open'
                ? 'No open cases. Create one to get started.'
                : 'No cases here yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th scope="col" className="px-6 py-3 font-medium">Case</th>
                  <th scope="col" className="px-6 py-3 font-medium">Customer</th>
                  <th scope="col" className="px-6 py-3 font-medium">Category</th>
                  <th scope="col" className="px-6 py-3 font-medium">Urgency</th>
                  <th scope="col" className="px-6 py-3 font-medium">Status</th>
                  <th scope="col" className="px-6 py-3 font-medium">AI confidence</th>
                  <th scope="col" className="px-6 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cases.map((caseRow) => (
                  <tr key={caseRow.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/cases/${caseRow.id}`}
                        className="group flex flex-col"
                      >
                        <span className="font-medium text-gray-900 group-hover:underline">
                          Case #{caseRow.id}
                        </span>
                        <span className="text-sm text-gray-500 max-w-md truncate">
                          {caseRow.subject}
                        </span>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {caseRow.customerEmail ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <CategoryBadge
                        category={
                          caseRow.latestAnalysis?.category ?? caseRow.category
                        }
                      />
                    </td>
                    <td className="px-6 py-4">
                      <UrgencyBadge urgency={caseRow.latestAnalysis?.urgency} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={caseRow.status} />
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatConfidence(caseRow.latestAnalysis?.confidence ?? null)}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatDate(caseRow.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
