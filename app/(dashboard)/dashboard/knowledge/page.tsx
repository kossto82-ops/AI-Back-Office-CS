import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen, FileText, Pill, HelpCircle, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getUser, getTeamForUser, getDocumentsForTeam } from '@/lib/db/queries';
import {
  documentTypeLabel,
  documentStatusLabel,
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES
} from '@/lib/db/case-categories';
import { cn } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});

function formatDate(date: Date | string): string {
  return dateFormatter.format(new Date(date));
}

const typeClass: Record<string, string> = {
  procedure: 'bg-blue-100 text-blue-800',
  faq: 'bg-purple-100 text-purple-800',
  guide: 'bg-teal-100 text-teal-800'
};

const statusClass: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  draft: 'bg-gray-100 text-gray-700'
};

const typeIcon: Record<string, typeof FileText> = {
  procedure: FileText,
  faq: HelpCircle,
  guide: Pill
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        typeClass[type] ?? 'bg-gray-100 text-gray-700'
      )}
    >
      {documentTypeLabel(type)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        statusClass[status] ?? 'bg-gray-100 text-gray-700'
      )}
    >
      {documentStatusLabel(status)}
    </span>
  );
}

function contentSnippet(content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  return collapsed.length > 120 ? `${collapsed.slice(0, 120)}\u2026` : collapsed;
}

export default async function KnowledgePage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  const params = await searchParams;
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const team = await getTeamForUser();
  if (!team) {
    redirect('/sign-in');
  }

  const q = params.q ?? '';
  const type = params.type ?? '';
  const status = params.status ?? '';

  let documents = await getDocumentsForTeam(team.id, q);
  if (type && DOCUMENT_TYPES.includes(type as (typeof DOCUMENT_TYPES)[number])) {
    documents = documents.filter((doc) => doc.type === type);
  }
  if (status && DOCUMENT_STATUSES.includes(status as (typeof DOCUMENT_STATUSES)[number])) {
    documents = documents.filter((doc) => doc.status === status);
  }

  const hasFilters = Boolean(q) || Boolean(type) || Boolean(status);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
            Knowledge Base
          </h1>
          <p className="text-sm text-gray-500">
            {documents.length} internal document
            {documents.length === 1 ? '' : 's'} for {team.name}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/knowledge/new">
            <Plus className="h-4 w-4" />
            Create document
          </Link>
        </Button>
      </div>

      <form
        key={`${q}|${type}|${status}`}
        method="GET"
        action="/dashboard/knowledge"
        className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]"
      >
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search procedures, FAQs, guides…"
          aria-label="Search knowledge base"
        />
        <select
          name="type"
          defaultValue={type}
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          aria-label="Filter by document type"
        >
          <option value="">All types</option>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {documentTypeLabel(t)}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {DOCUMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {documentStatusLabel(s)}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {hasFilters && (
            <Button asChild variant="ghost">
              <Link href="/dashboard/knowledge">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      <Card className="overflow-x-auto">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
            <BookOpen className="h-10 w-10 text-gray-300" />
            {hasFilters ? (
              <>
                <p className="text-sm text-gray-500">
                  No documents match your search and filters.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/knowledge">Clear search</Link>
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">
                  No knowledge documents yet
                </p>
                <p className="max-w-sm text-sm text-gray-500">
                  Create procedures, FAQs, and guides so agents and the AI
                  analysis pipeline always work from trusted internal knowledge.
                </p>
                <Button asChild size="sm">
                  <Link href="/dashboard/knowledge/new">
                    <Plus className="h-4 w-4" />
                    Create document
                  </Link>
                </Button>
              </>
            )}
          </div>
        ) : (
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3 font-medium">Document</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Version</th>
                <th className="px-6 py-3 font-medium">Updated</th>
                <th className="px-6 py-3 font-medium">Created by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {documents.map((doc) => {
                const Icon = typeIcon[doc.type] ?? FileText;
                return (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/knowledge/${doc.id}`}
                        className="group flex items-start gap-2"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium text-gray-900 group-hover:underline">
                            {doc.title}
                          </span>
                          {q && (
                            <span className="mt-0.5 max-w-md text-sm text-gray-500">
                              {contentSnippet(doc.content)}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <TypeBadge type={doc.type} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="px-6 py-4 text-gray-600">v{doc.version}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatDate(doc.updatedAt)}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {doc.creatorName ?? '\u2014'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
}