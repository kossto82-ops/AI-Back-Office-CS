'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  DOCUMENT_TYPES,
  documentTypeLabel,
  type DocumentType
} from '@/lib/db/case-categories';
import {
  IMPORT_MAX_DOCUMENTS,
  parseImportFile,
  type ParsedDocument
} from '@/lib/knowledge/import-parse';
import { importDocuments } from '../actions';

type ActionState = {
  error?: string;
  success?: string;
  imported?: number;
  skipped?: string[];
};

type Row = ParsedDocument & { id: number; include: boolean };

export function ImportForm() {
  const [state, action, isPending] = useActionState<ActionState, FormData>(
    importDocuments,
    {}
  );
  const [defaultType, setDefaultType] = useState<DocumentType>('guide');
  const [status, setStatus] = useState<'draft' | 'active'>('draft');
  const [rows, setRows] = useState<Row[]>([]);
  const [readError, setReadError] = useState('');
  const [pasted, setPasted] = useState('');

  // After a successful import the review list is spent; clear it so a second
  // click cannot resubmit the same documents.
  useEffect(() => {
    if (state.success) setRows([]);
  }, [state.success, state]);

  const importable = useMemo(
    () => rows.filter((row) => row.include && !row.problem),
    [rows]
  );
  const payload = useMemo(
    () =>
      JSON.stringify(
        importable.map(({ title, type, content }) => ({ title, type, content }))
      ),
    [importable]
  );

  function addDocuments(docs: ParsedDocument[]) {
    setRows((current) => {
      const start = current.length;
      return [
        ...current,
        ...docs.map((doc, index) => ({
          ...doc,
          id: start + index,
          include: !doc.problem
        }))
      ];
    });
  }

  async function handleFiles(files: FileList | null) {
    setReadError('');
    if (!files || files.length === 0) return;
    try {
      for (const file of Array.from(files)) {
        addDocuments(parseImportFile(file.name, await file.text(), defaultType));
      }
    } catch {
      setReadError('One of the files could not be read as text.');
    }
  }

  function addPasted() {
    if (!pasted.trim()) return;
    addDocuments(parseImportFile('pasted.md', pasted, defaultType));
    setPasted('');
  }

  const tooMany = importable.length > IMPORT_MAX_DOCUMENTS;

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href="/dashboard/knowledge"
        className="mb-3 inline-flex items-center text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Knowledge Base
      </Link>
      <h1 className="mb-6 text-lg font-medium text-gray-900 lg:text-2xl">
        Import documents
      </h1>

      <Card className="mb-6 max-w-4xl">
        <CardHeader>
          <CardTitle className="text-sm text-gray-700">1. Add files or text</CardTitle>
          <CardDescription>
            Markdown or text files (the first <code># Heading</code> becomes the
            title; a file with several <code># </code> headings becomes several
            documents) and CSV files with <code>title</code>, <code>content</code>{' '}
            and optional <code>type</code> columns. Up to {IMPORT_MAX_DOCUMENTS}{' '}
            documents per import.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="defaultType" className="mb-2">
              Type for documents that do not specify one
            </Label>
            <select
              id="defaultType"
              value={defaultType}
              onChange={(event) => setDefaultType(event.target.value as DocumentType)}
              className="h-9 rounded-md border border-gray-300 px-2 text-sm"
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {documentTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="files" className="mb-2">
              Files
            </Label>
            <input
              id="files"
              type="file"
              multiple
              accept=".md,.markdown,.txt,.csv,text/plain,text/markdown,text/csv"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = '';
              }}
              className="block text-sm"
            />
            {readError ? (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {readError}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="pasted" className="mb-2">
              Or paste text
            </Label>
            <textarea
              id="pasted"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={6}
              className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={!pasted.trim()}
              onClick={addPasted}
            >
              <Upload className="mr-2 h-4 w-4" />
              Add pasted text
            </Button>
          </div>
        </CardContent>
      </Card>

      <form action={action}>
        <input type="hidden" name="payload" value={payload} />
        <input type="hidden" name="status" value={status} />
        <Card className="max-w-4xl">
          <CardHeader>
            <CardTitle className="text-sm text-gray-700">
              2. Review ({importable.length} of {rows.length} will be imported)
            </CardTitle>
            <CardDescription>
              Documents whose title already exists in your Knowledge Base are
              skipped, never overwritten.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing added yet.</p>
            ) : (
              <ul className="divide-y divide-gray-200 text-sm">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Include ${row.title || row.source}`}
                      checked={row.include && !row.problem}
                      disabled={Boolean(row.problem)}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((r) =>
                            r.id === row.id ? { ...r, include: event.target.checked } : r
                          )
                        )
                      }
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900">
                        {row.title || '(no title)'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {row.source} · {documentTypeLabel(row.type)} ·{' '}
                        {row.content.length.toLocaleString('en-US')} characters
                      </p>
                      {row.problem ? (
                        <p className="text-xs font-medium text-red-700">
                          Cannot import: {row.problem}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap items-center gap-4">
            <div>
              <Label htmlFor="importStatus" className="mb-1 block text-xs">
                Import as
              </Label>
              <select
                id="importStatus"
                value={status}
                onChange={(event) => setStatus(event.target.value as 'draft' | 'active')}
                className="h-9 rounded-md border border-gray-300 px-2 text-sm"
              >
                <option value="draft">Draft (not used by the AI until you activate it)</option>
                <option value="active">Active (used by the AI immediately)</option>
              </select>
            </div>
            <Button
              type="submit"
              disabled={isPending || importable.length === 0 || tooMany}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${importable.length} document${importable.length === 1 ? '' : 's'}`
              )}
            </Button>
            {tooMany ? (
              <p className="text-sm text-red-600">
                Too many documents: the limit is {IMPORT_MAX_DOCUMENTS} per import.
              </p>
            ) : null}
          </CardFooter>
          {state.error ? (
            <CardContent>
              <p role="alert" className="text-sm text-red-600">
                {state.error}
              </p>
            </CardContent>
          ) : null}
          {state.success ? (
            <CardContent className="space-y-1">
              <p role="status" className="text-sm text-emerald-700">
                {state.success}
              </p>
              {state.skipped && state.skipped.length > 0 ? (
                <p className="text-sm text-amber-700">
                  Skipped (title already exists): {state.skipped.join(', ')}
                </p>
              ) : null}
              <Link
                href="/dashboard/knowledge"
                className="text-sm text-gray-700 underline"
              >
                Go to the Knowledge Base
              </Link>
            </CardContent>
          ) : null}
        </Card>
      </form>
    </section>
  );
}
