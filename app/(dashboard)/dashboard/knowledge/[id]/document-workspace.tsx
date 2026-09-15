'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookLock, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  documentTypeLabel,
  documentStatusLabel
} from '@/lib/db/case-categories';
import { DocumentEditor } from '../document-editor';

type WorkspaceDocument = {
  id: number;
  title: string;
  type: string;
  status: string;
  version: number;
  content: string;
  creatorName: string | null;
  updatedAt: string;
};

const typeClass: Record<string, string> = {
  procedure: 'bg-blue-100 text-blue-800',
  faq: 'bg-purple-100 text-purple-800',
  guide: 'bg-teal-100 text-teal-800'
};

const statusClass: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  draft: 'bg-gray-100 text-gray-700'
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        className
      )}
    >
      {children}
    </span>
  );
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(date));
}

export function DocumentWorkspace({
  document
}: {
  document: WorkspaceDocument;
}) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href="/dashboard/knowledge"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Knowledge Base
      </Link>

      <Card className="max-w-3xl">
        <CardHeader>
          <div className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
            <BookLock className="h-3.5 w-3.5" />
            Internal knowledge &middot; trusted company content
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-lg lg:text-2xl font-medium text-gray-900 break-words">
                {document.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className={typeClass[document.type] ?? 'bg-gray-100 text-gray-700'}>
                  {documentTypeLabel(document.type)}
                </Badge>
                <Badge className={statusClass[document.status] ?? 'bg-gray-100 text-gray-700'}>
                  {documentStatusLabel(document.status)}
                </Badge>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  v{document.version}
                </span>
              </div>
            </div>
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <PencilLine className="h-4 w-4" />
                Edit document
              </Button>
            )}
          </div>

          <p className="text-sm text-gray-500">
            Created by {document.creatorName ?? 'Unknown'} &middot; Updated{' '}
            {formatDate(document.updatedAt)}
          </p>
        </CardHeader>

        <CardContent>
          {isEditing ? (
            <DocumentEditor
              document={{
                id: document.id,
                title: document.title,
                type: document.type,
                content: document.content,
                status: document.status
              }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                Content
              </p>
              <div className="rounded-md border border-gray-200 bg-gray-50/50 px-5 py-4 text-sm leading-7 text-gray-800 whitespace-pre-wrap">
                {document.content}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter>
          <p className="text-xs text-gray-500">
            Knowledge in this document is treated as trusted internal company
            data. Only your team can view or edit it.
          </p>
        </CardFooter>
      </Card>
    </section>
  );
}