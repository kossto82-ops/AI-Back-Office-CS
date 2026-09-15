'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES,
  documentTypeLabel,
  documentStatusLabel
} from '@/lib/db/case-categories';
import { createDocument, updateDocument } from './actions';

type ActionState = {
  error?: string;
  success?: string;
};

type EditorValues = {
  id?: number;
  title: string;
  type: string;
  content: string;
  status: string;
};

export function DocumentEditor({
  document,
  onCancel
}: {
  document: EditorValues;
  onCancel?: () => void;
}) {
  const isEdit = typeof document.id === 'number';

  const [state, action, isPending] = useActionState<ActionState, FormData>(
    isEdit ? updateDocument : createDocument,
    {}
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      {isEdit && (
        <input type="hidden" name="id" value={document.id} />
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={document.title}
          placeholder="e.g. Refund Approval Procedure"
          required
          maxLength={255}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">Document type</Label>
          <select
            id="type"
            name="type"
            defaultValue={document.type}
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {documentTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={document.status}
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            {DOCUMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {documentStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="content">Content</Label>
        <textarea
          id="content"
          name="content"
          defaultValue={document.content}
          placeholder="Describe the procedure, answer, or guidance in plain steps…"
          required
          className="min-h-[380px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        />
        <p className="text-xs text-gray-500">
          Active documents are eligible for retrieval by the AI analysis
          pipeline. Drafts are only visible inside the Knowledge Base.
        </p>
      </div>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-600" role="status">
          {state.success}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create document'}
        </Button>
        {isEdit && onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}