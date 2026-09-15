import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getUser, getTeamForUser, getCasesForTeam } from '@/lib/db/queries';
import { caseCategoryLabel, caseStatusLabel } from '@/lib/db/case-categories';
import { cn } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
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
    return <span className="text-sm text-gray-400">Unclassified</span>;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
      {caseCategoryLabel(category)}
    </span>
  );
}

function formatConfidence(confidence: number | null): string {
  if (confidence === null || Number.isNaN(confidence)) {
    return '\u2014';
  }
  return `${Math.round(confidence * 100)}%`;
}

export default async function CasesPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const team = await getTeamForUser();
  if (!team) {
    redirect('/sign-in');
  }

  const cases = await getCasesForTeam(team.id);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
            Cases
          </h1>
          <p className="text-sm text-gray-500">
            {cases.length} case{cases.length === 1 ? '' : 's'} for{' '}
            {team.name}
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        {cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Inbox className="h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">No cases yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3 font-medium">Case</th>
                <th className="px-6 py-3 font-medium">Customer</th>
                <th className="px-6 py-3 font-medium">Category</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">AI confidence</th>
                <th className="px-6 py-3 font-medium">Created</th>
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
                    {caseRow.customerEmail ?? '\u2014'}
                  </td>
                  <td className="px-6 py-4">
                    <CategoryBadge category={caseRow.category} />
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
        )}
      </Card>
    </section>
  );
}