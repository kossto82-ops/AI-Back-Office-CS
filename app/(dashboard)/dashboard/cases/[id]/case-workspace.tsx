'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  Check,
  ClipboardCopy,
  FlaskConical,
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
  caseStatusLabel,
  documentTypeLabel
} from '@/lib/db/case-categories';
import { markCaseResolved, recordExperimentResult, runCaseAnalysis } from '../actions';
import type { ConversationTurn } from '@/lib/db/schema';
import type { P9Condition } from '@/scripts/phase9/dataset';

export type WorkspaceSource = {
  documentId: number | null;
  relevance: number;
  legacy: string | null;
  title?: string;
  type?: string;
  version?: number;
};

type WorkspaceAnalysis = {
  category: string | null;
  summary: string | null;
  intent: string | null;
  urgency: string | null;
  recommendedAction: string | null;
  draftResponse: string | null;
  missingInformation: string[];
  sources: WorkspaceSource[];
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
  manualReview?: string;
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
    <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
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

export function CaseWorkspace({
  caseRow,
  experiment = null
}: {
  caseRow: WorkspaceCaseRow;
  experiment?: { condition: P9Condition } | null;
}) {
  const router = useRouter();
  const analysis = caseRow.latestAnalysis;
  const isExperiment = experiment !== null && experiment !== undefined;
  const experimentCondition = isExperiment ? experiment.condition : null;
  const manualMode = experimentCondition === 'manual';
  const initialDraft = analysis?.draftResponse ?? '';
  const [draft, setDraft] = useState(manualMode ? '' : initialDraft);
  const [isEditing, setIsEditing] = useState(manualMode);
  const [copied, setCopied] = useState(false);
  const [resolveState, resolveAction, isResolvePending] = useActionState<
    ActionState,
    FormData
  >(markCaseResolved, {});
  const [runState, runAction, isRunPending] = useActionState<ActionState, FormData>(
    runCaseAnalysis,
    {}
  );
  const [resultState, resultAction, isResultPending] = useActionState<
    ActionState,
    FormData
  >(recordExperimentResult, {});

  const openedAtRef = useRef<number>(Date.now());
  const keystrokesRef = useRef(0);
  const editSessionsRef = useRef(manualMode ? 1 : 0);
  const lastDraftLenRef = useRef(manualMode ? 0 : initialDraft.length);
  const elapsedHiddenRef = useRef<HTMLInputElement>(null);
  const editSessionsHiddenRef = useRef<HTMLInputElement>(null);
  const keystrokesHiddenRef = useRef<HTMLInputElement>(null);
  const draftHiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (runState.success) {
      router.refresh();
    }
  }, [runState.success]);

  useEffect(() => {
    setIsEditing(false);
    if (analysis?.createdAt) {
      const prefilled = analysis.draftResponse ?? '';
      setDraft(prefilled);
      lastDraftLenRef.current = prefilled.length;
    }
  }, [analysis?.createdAt]);

  function handleDraftChange(value: string) {
    const delta = Math.abs(value.length - lastDraftLenRef.current);
    lastDraftLenRef.current = value.length;
    keystrokesRef.current += delta;
    setDraft(value);
  }

  function enterEditSession() {
    if (!isEditing) {
      editSessionsRef.current += 1;
      setIsEditing(true);
    }
  }

  function handleMarkUsableSubmit(e: React.FormEvent<HTMLFormElement>) {
    const elapsedMs = Date.now() - openedAtRef.current;
    if (elapsedHiddenRef.current) {
      elapsedHiddenRef.current.value = String(elapsedMs);
    }
    if (editSessionsHiddenRef.current) {
      editSessionsHiddenRef.current.value = String(editSessionsRef.current);
    }
    if (keystrokesHiddenRef.current) {
      keystrokesHiddenRef.current.value = String(keystrokesRef.current);
    }
    if (draftHiddenRef.current) {
      draftHiddenRef.current.value = draft;
    }
  }

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

  const canEditDraft = manualMode || Boolean(analysis);
  const displayEditing = manualMode || isEditing;
  const analysisUnavailable = analysis === null;
  const isResolved = caseRow.status === 'resolved';
  const runButtonLabel = analysisUnavailable ? 'Run analysis' : 'Re-run analysis';

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

      {isExperiment && (
        <div
          className={cn(
            'mb-6 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
            manualMode
              ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          )}
        >
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              Phase 9 experiment —{' '}
              {manualMode ? 'manual baseline' : 'AI-assisted'}
            </p>
            {manualMode ? (
              <p className="mt-1 text-indigo-700">
                The AI analysis is intentionally hidden. Ground your response in
                the Knowledge Base, write it below, then mark it usable when it
                is ready to send.
              </p>
            ) : (
              <p className="mt-1 text-emerald-700">
                Run the analysis, review and edit the draft, then mark it usable
                when it is ready to send.
              </p>
            )}
          </div>
        </div>
      )}

      {/* WHAT CUSTOMER SAID */}
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

      {/* SYSTEM UNDERSTOOD */}
      {!manualMode && (
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
          {runState.error ? (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {runState.error}
            </p>
          ) : null}
          {runState.manualReview ? (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {runState.manualReview}
            </p>
          ) : null}
          {runState.success && !analysis ? (
            <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {runState.success}
            </p>
          ) : null}
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
            <Placeholder text="This case has not been analyzed yet. Run the analysis to generate the AI result." />
          )}
        </CardContent>
      </Card>
      )}

      {/* KNOWLEDGE */}
      {!manualMode && (
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
                  {source.legacy ? (
                    <span>{source.legacy}</span>
                  ) : (
                    <span>
                      <span className="font-medium text-gray-900">
                        {source.title ?? `Document #${source.documentId ?? ''}`}
                      </span>
                      <span className="text-gray-500">
                        {source.type ? ` · ${documentTypeLabel(source.type)}` : ''}
                        {source.version ? ` · v${source.version}` : ''}
                        {' · relevance '}
                        {source.relevance}
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Placeholder text="No sources retrieved yet." />
          )}
        </CardContent>
      </Card>
      )}

      {/* RECOMMENDS */}
      {!manualMode && (
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
      )}

      {/* RESPONSE + HUMAN REVIEW */}
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
            displayEditing ? (
              <textarea
                value={draft}
                onChange={(event) => handleDraftChange(event.target.value)}
                rows={8}
                placeholder={
                  manualMode
                    ? 'Write the response for the customer here...'
                    : undefined
                }
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
          {!manualMode && (
            <Button
              variant="outline"
              size="sm"
              disabled={!canEditDraft}
              title={canEditDraft ? undefined : 'Available once an analysis exists'}
              onClick={() => {
                if (isEditing) {
                  setIsEditing(false);
                } else {
                  enterEditSession();
                }
              }}
            >
              <PencilLine className="mr-2 h-4 w-4" />
              {isEditing ? 'Done editing' : 'Edit response'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!draft}
            title={draft ? undefined : 'No draft response available yet'}
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

      {!manualMode && (
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
                  <p className="text-xs text-gray-400">
                    Model: {analysis.model}
                  </p>
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
                  <li key={index} className="text-sm text-gray-800">
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
      )}

      {isExperiment && (
        <Card className="mb-6 border-indigo-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-gray-700">
              <FlaskConical className="h-4 w-4 text-indigo-500" />
              Mark response as usable
            </CardTitle>
            <CardDescription>
              Records the time, edits, keystrokes, and final text for this
              experiment case.
            </CardDescription>
          </CardHeader>
          <CardFooter className="gap-2">
            <form
              action={resultAction}
              onSubmit={handleMarkUsableSubmit}
              className="flex items-center gap-3"
            >
              <input type="hidden" name="caseId" value={caseRow.id} />
              <input
                type="hidden"
                name="condition"
                value={experimentCondition ?? ''}
              />
              <input type="hidden" name="elapsedMs" ref={elapsedHiddenRef} defaultValue="0" />
              <input type="hidden" name="editSessions" ref={editSessionsHiddenRef} defaultValue="0" />
              <input type="hidden" name="keystrokes" ref={keystrokesHiddenRef} defaultValue="0" />
              <input type="hidden" name="draftResponse" ref={draftHiddenRef} defaultValue="" />
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={isResultPending || !draft.trim()}
                title={draft.trim() ? undefined : 'Write a response first'}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isResultPending ? 'Recording...' : 'Mark response as usable'}
              </Button>
              {resultState?.error && (
                <span className="text-sm text-red-600">{resultState.error}</span>
              )}
              {resultState?.success && (
                <span className="text-sm text-indigo-700">
                  {resultState.success}
                </span>
              )}
            </form>
          </CardFooter>
        </Card>
      )}

      <Card>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="flex items-center gap-3">
            {!manualMode && (
              <form action={runAction}>
                <input type="hidden" name="caseId" value={caseRow.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  disabled={isRunPending || isResolved}
                  title={isResolved ? 'Resolved cases cannot be re-analyzed' : undefined}
                >
                  <RotateCw className="mr-2 h-4 w-4" />
                  {isRunPending ? 'Analyzing...' : runButtonLabel}
                </Button>
              </form>
            )}
            {!manualMode && runState.success && analysis && (
              <span className="text-xs text-emerald-600">
                {runState.success}
              </span>
            )}
          </div>
          <form action={resolveAction}>
            <input type="hidden" name="caseId" value={caseRow.id} />
            <Button
              type="submit"
              variant={isResolved ? 'outline' : 'default'}
              disabled={isResolvePending || isResolved}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isResolvePending
                ? 'Marking...'
                : isResolved
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