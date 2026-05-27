export interface ApiProfile {
  api_key: string;
  test_mode: boolean;
}

export interface Config {
  profiles: Record<string, ApiProfile>;
  active_profile: string;
}

export interface MeResponse {
  id: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
    first_name?: string;
    [key: string]: unknown;
  };
  account: {
    id: string;
    name: string;
    plan_tier: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface Recipient {
  id: string;
  email: string;
  name: string;
  status: string;
  signing_url?: string;
  embedded_signing_url?: string;
  embedded_signing?: boolean;
  signed_at?: string;
  last_viewed_at?: string;
  [key: string]: unknown;
}

export interface DocumentFile {
  name: string;
  file_base64?: string;
  file_url?: string;
}

export interface Document {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at?: string;
  expires_at?: string;
  subject?: string;
  message?: string;
  recipients: Recipient[];
  files?: DocumentFile[];
  test_mode?: boolean;
  [key: string]: unknown;
}

export interface Template {
  id: string;
  name: string;
  created_at: string;
  updated_at?: string;
  placeholder_roles?: PlaceholderRole[];
  fields?: TemplateField[];
  [key: string]: unknown;
}

export interface PlaceholderRole {
  name: string;
  email?: string;
  [key: string]: unknown;
}

export interface TemplateField {
  name: string;
  type: string;
  required?: boolean;
  [key: string]: unknown;
}

export interface BulkSend {
  id: string;
  name?: string;
  status: string;
  total: number;
  sent?: number;
  failed?: number;
  created_at: string;
  [key: string]: unknown;
}

export interface Webhook {
  id: string;
  callback_url: string;
  event_types?: string[];
  created_at?: string;
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ApiError {
  code: string;
  message: string;
  hint: string;
  http_status: number;
}

export interface JsonEnvelope<T> {
  success: boolean;
  error: ApiError | null;
  data: T | null;
  meta: Record<string, unknown>;
}

export interface CsvValidationResult {
  valid: boolean;
  rows?: Array<{
    row: number;
    valid: boolean;
    errors?: string[];
  }>;
  [key: string]: unknown;
}
