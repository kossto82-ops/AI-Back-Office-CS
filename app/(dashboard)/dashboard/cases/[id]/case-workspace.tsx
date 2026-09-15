'use client';

import Link from 'next/link';
import { useState, useActionState } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  ClipboardCopy,
  Lightbulb,
  PencilLine,
  RotateCw,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  caseCategoryLabel,
  caseStatusLabel
} from '@/lib/db/case-categories';
import { markCaseResolved } from '../actions';
import type { ConversationTurn } from '@/lib/db/schema';

type WorkspaceAnalysis = {
  category: string | null;
  summary: string | null;
  intent: string | null;
  urgency: string | null;
  recommendedAction: string | null;
  draftResponse: string | null;
  missingInformation: string[];
  sources: string[];
  confidence: number | null;
  model: string | null;
  createdAt: string | null;
} | null;

type WorkspaceCaseRow = {
  id: number;
  subject: string;
  customerEmail: string | null;
  category: string | null;
  status: string;
  customerMessage: string;
  conversationHistory: ConversationTurn[];
  createdAt: string;
  latestAnalysis: WorkspaceAnalysis;
};

type ActionState = {
  error?: string;
  success?: string;
};

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

function Placeholder({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-400">
      {text}
    </p>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
      {children}
    </p>
  );
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(date));
}

function formatUrgency(urgency: string | null): string {
  if (!urgency) return '\u2014';
  return urgency.charAt(0).toUpperCase() + urgency.slice(1);
}

export function CaseWorkspace({ caseRow }: { caseRow: WorkspaceCaseRow }) {
  const analysis = caseRow.latestAnalysis;
  const initialDraft = analysis?.draftResponse ?? '';
  const [draft, setDraft] = useState(initialDraft);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rerunNotice, setRerunNotice] = useState<string | null>(null);
  const [resolveState, resolveAction, isResolvePending] = useActionState<
    ActionState,
    FormData
  >(markCaseResolved, {});

  async function handleCopy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function handleRerun() {
    setRerunNotice(
      'Analysis re-run is not implemented yet (planned for Phase 4).'
    );
  }

  const canEditDraft = Boolean(analysis);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6">
        <Link
          href="/dashboard/cases"
          className="mb-3 inline-flex items-center text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          All cases
        </Link>
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
          Case #{caseRow.id}
        </h1>
        <p className="mt-1 text-gray-500">{caseRow.subject}</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {caseRow.category ? (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
            {caseCategoryLabel(caseRow.category)}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-400">
            Unclassified
          </span>
        )}
        <StatusBadge status={caseRow.status} />
        {caseRow.customerEmail && (
          <span className="text-sm text-gray-500">{caseRow.customerEmail}</span>
        )}
        <span className="text-sm text-gray-400">
          Created {formatDate(caseRow.createdAt)}
        </span>
      </div>

      {/* Customer information */}
      <Card className="mb-6 bg-gray-50 border-gray-200">
        <CardHeader>
          <CardTitle className="text-sm text-gray-700">
            Customer message
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-gray-900">
            {caseRow.customerMessage}
          </p>
        </CardContent>
      </Card>

      {caseRow.conversationHistory.length > 0 && (
        <details className="mb-6 rounded-xl border border-gray-200 bg-white py-3 px-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            Conversation history ({caseRow.conversationHistory.length} messages)
          </summary>
          <ul className="mt-3 space-y-3">
            {caseRow.conversationHistory.map((turn, index) => (
              <li key={index} className="text-sm">
                <span
                  className={cn(
                    'mb-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium',
                    turn.role === 'customer'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-200 text-gray-700'
                  )}
                >
                  {turn.role === 'customer' ? 'Customer' : 'Agent'}
                </span>
                <p className="whitespace-pre-wrap text-gray-800">
                  {turn.content}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* AI-generated information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-gray-700">
            <Bot className="h-4 w-4 text-orange-500" />
            AI analysis
          </CardTitle>
          <CardDescription>
            AI-generated content. Review before sending anything to the
            customer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysis ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <SectionLabel>Category</SectionLabel>
                  <p className="text-sm font-medium text-gray-900">
                    {caseCategoryLabel(analysis.category ?? caseRow.category ?? '')}
                  </p>
                </div>
                <div>
                  <SectionLabel>Intent</SectionLabel>
                  <p className="text-sm text-gray-900">
                    {analysis.intent ?? '\u2014'}
                  </p>
                </div>
                <div>
                  <SectionLabel>Urgency</SectionLabel>
                  <p className="text-sm text-gray-900">
                    {formatUrgency(analysis.urgency)}
                  </p>
                </div>
              </div>
              <div>
                <SectionLabel>Summary</SectionLabel>
                <p className="text-sm text-gray-800">
                  {analysis.summary ?? '\u2014'}
                </p>
              </div>
            </div>
          ) : (
            <Placeholder text="This case has not been analyzed yet. AI analysis becomes available after the re-run pipeline is implemented (Phase 4)." />
          )}
        </CardContent>
      </Card>

      <Card
        className={cn(
          'mb-6',
          analysis?.recommendedAction && 'border-amber-300 bg-amber-50/40'
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-gray-700">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Recommended action
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analysis?.recommendedAction ? (
            <p className="text-sm text-gray-900">
              {analysis.recommendedAction}
            </p>
          ) : (
            <Placeholder text="No recommended action available yet." />
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-gray-700">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Draft response
          </CardTitle>
          <CardDescription>
            Human approval step: verify, edit, then copy to your reply.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canEditDraft ? (
            isEditing ? (
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={8}
                className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            ) : (
              <p className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900">
                {draft || '\u2014'}
              </p>
            )
          ) : (
            <Placeholder text="No draft response available yet." />
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canEditDraft}
            onClick={() => setIsEditing((value) => !value)}
          >
            <PencilLine className="mr-2 h-4 w-4" />
            {isEditing ? 'Done editing' : 'Edit response'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!draft}
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="mr-2 h-4 w-4 text-emerald-500" />
            ) : (
              <ClipboardCopy className="mr-2 h-4 w-4" />
            )}
            {copied ? 'Copied' : 'Copy response'}
          </Button>
        </CardFooter>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-gray-700">
            <Sparkles className="h-4 w-4 text-orange-500" />
            Knowledge sources
          </CardTitle>
          <CardDescription>
            Documents used to support this analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysis && analysis.sources.length > 0 ? (
            <ul className="space-y-2">
              {analysis.sources.map((source, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-gray-800"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  {source}
                </li>
              ))}
            </ul>
          ) : (
            <Placeholder text="No sources retrieved yet." />
          )}
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-700">
              AI confidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analysis?.confidence !== null && analysis?.confidence !== undefined ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Confidence</span>
                  <span className="text-sm font-medium text-gray-900">
                    {Math.round(analysis.confidence * 100)}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-orange-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, analysis.confidence * 100))}%`
                    }}
                  />
                </div>
                {analysis.model && (
                  <p className="text-xs text-gray-400">Model: {analysis.model}</p>
                )}
              </div>
            ) : (
              <Placeholder text="No confidence score yet." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-700">
              Missing information
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analysis && analysis.missingInformation.length > 0 ? (
              <ul className="space-y-1.5">
                {analysis.missingInformation.map((item, index) => (
                  <li
                    key={index}
                    className="text-sm text-gray-800"
                  >
                    {'\u2022'} {item}
                  </li>
                ))}
              </ul>
            ) : (
              <Placeholder text="Nothing missing. The analysis was able to use the available information." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleRerun}>
              <RotateCw className="mr-2 h-4 w-4" />
              Re-run analysis
            </Button>
            {rerunNotice && (
              <span className="text-xs text-gray-500">{rerunNotice}</span>
            )}
          </div>
          <form action={resolveAction}>
            <input type="hidden" name="caseId" value={caseRow.id} />
            <Button
              type="submit"
              variant={caseRow.status === 'resolved' ? 'outline' : 'default'}
              disabled={isResolvePending || caseRow.status === 'resolved'}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isResolvePending
                ? 'Marking...'
                : caseRow.status === 'resolved'
                ? 'Resolved'
                : 'Mark as resolved'}
            </Button>
          </form>
        </CardFooter>
        {resolveState?.error && (
          <CardContent className="pt-0">
            <p className="text-red-500 text-sm">{resolveState.error}</p>
          </CardContent>
        )}
        {resolveState?.success && (
          <CardContent className="pt-0">
            <p className="text-emerald-600 text-sm">{resolveState.success}</p>
          </CardContent>
        )}
      </Card>
    </section>
  );
}