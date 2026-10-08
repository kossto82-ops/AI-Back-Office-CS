export const CASE_CATEGORIES = [
  'billing',
  'cancellation',
  'activation',
  'technical_issue',
  'general_information',
] as const;

export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export const CASE_CATEGORY_LABELS: Record<CaseCategory, string> = {
  billing: 'Billing',
  cancellation: 'Cancellation',
  activation: 'Activation',
  technical_issue: 'Technical Issue',
  general_information: 'General Information',
};

export function caseCategoryLabel(category: string): string {
  return CASE_CATEGORY_LABELS[category as CaseCategory] ?? category;
}

// Only these two states are ever written. 'approved' and 'failed' existed in the
// starter model but nothing sets them; add them back when a workflow needs them.
export const CASE_STATUSES = ['queued', 'resolved'] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  queued: 'Queued',
  resolved: 'Resolved',
};

export function caseStatusLabel(status: string): string {
  return CASE_STATUS_LABELS[status as CaseStatus] ?? status;
}

export const DOCUMENT_TYPES = ['procedure', 'faq', 'guide'] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  procedure: 'Procedure',
  faq: 'FAQ',
  guide: 'Guide',
};

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type as DocumentType] ?? type;
}

// archived: kept for history, excluded from retrieval and from the default list.
export const DOCUMENT_STATUSES = ['draft', 'active', 'archived'] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

export function documentStatusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status as DocumentStatus] ?? status;
}