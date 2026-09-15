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

export const CASE_STATUSES = ['queued', 'approved', 'resolved', 'failed'] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  queued: 'Queued',
  approved: 'Approved',
  resolved: 'Resolved',
  failed: 'Failed',
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

export const DOCUMENT_STATUSES = ['draft', 'active'] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Draft',
  active: 'Active',
};

export function documentStatusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status as DocumentStatus] ?? status;
}