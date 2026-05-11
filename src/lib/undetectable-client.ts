import "server-only";

export type UndetectableApiSuccessResponse<TData> = {
  code: 0;
  status: "success";
  data: TData;
};

export type UndetectableApiErrorResponse = {
  code: 1;
  status: "error";
  data: {
    error: string;
  };
};

export type UndetectableApiResponse<TData> =
  | UndetectableApiSuccessResponse<TData>
  | UndetectableApiErrorResponse;

export type UndetectableProfileStatus = "Started" | "Locked" | "Available" | (string & {});

export type UndetectableProfileSummary = {
  name: string;
  status: UndetectableProfileStatus;
  debug_port: string;
  websocket_link: string;
  folder: string;
  tags: string[];
  cloud_id?: string;
  creation_date?: number;
  modify_date?: number;
};

export type UndetectableProfilesListData = Record<string, UndetectableProfileSummary>;

export type UndetectableCreateProfileRequest = Partial<{
  name: string;
  os: string;
  browser: string;
  cpu: number;
  memory: number;
  tags: string[];
  geolocation: string;
  resolution: string;
  proxy: string;
  notes: string;
  folder: string;
  language: string;
  cookies: unknown[];
  type: "cloud" | "local" | (string & {});
  group: string;
  configid: string;
  accounts: Array<{ website: string; username: string; password: string }>;
  timezone: string;
}>;

export type UndetectableCreateProfileData = {
  profile_id: string;
  name: string;
};

export type UndetectableStartProfileData = {
  name: string;
  websocket_link: string;
  debug_port: string;
  folder: string;
  tags: string[];
};

export type UndetectableStatusData = Record<string, never>;

export class UndetectableApiError extends Error {
  readonly kind = "UndetectableApiError";
  readonly httpStatus?: number;
  readonly apiError?: string;

  constructor(message: string, opts?: { httpStatus?: number; apiError?: string }) {
    super(message);
    this.name = "UndetectableApiError";
    this.httpStatus = opts?.httpStatus;
    this.apiError = opts?.apiError;
  }
}

function baseUrl(): string {
  return (process.env.UNDETECTABLE_API_BASE_URL?.trim() || "http://127.0.0.1:25325").replace(
    /\/+$/,
    "",
  );
}

function isApiResponse<TData>(value: unknown): value is UndetectableApiResponse<TData> {
  if (!value || typeof value !== "object") return false;
  const v = value as { code?: unknown; status?: unknown; data?: unknown };
  return (
    (v.code === 0 || v.code === 1) &&
    (v.status === "success" || v.status === "error") &&
    "data" in v
  );
}

export async function undetectableFetch<TData>(
  path: string,
  init?: RequestInit & { searchParams?: Record<string, string | undefined> },
): Promise<UndetectableApiSuccessResponse<TData>> {
  const url = new URL(path, `${baseUrl()}/`);
  const searchParams = init?.searchParams ?? {};
  for (const [k, v] of Object.entries(searchParams)) {
    if (v != null && v !== "") {
      url.searchParams.set(k, v);
    }
  }

  const { searchParams: _ignored, ...requestInit } = init ?? {};

  let res: Response;
  try {
    res = await fetch(url, {
      ...requestInit,
      headers: {
        accept: "application/json",
        ...(requestInit.headers ?? {}),
      },
      signal: requestInit.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new UndetectableApiError(`Failed to reach Undetectable API at ${url}: ${message}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new UndetectableApiError(`Undetectable API returned non-JSON (${res.status}): ${message}`, {
      httpStatus: res.status,
    });
  }

  if (!isApiResponse<TData>(json)) {
    throw new UndetectableApiError("Undetectable API response shape mismatch", {
      httpStatus: res.status,
    });
  }

  if (json.code === 1) {
    throw new UndetectableApiError("Undetectable API returned error", {
      httpStatus: res.status,
      apiError: json.data?.error,
    });
  }

  return json;
}

export async function undetectableStatus() {
  return await undetectableFetch<UndetectableStatusData>("/status");
}

export async function undetectableListProfiles() {
  return await undetectableFetch<UndetectableProfilesListData>("/list");
}

export async function undetectableCreateProfile(body: UndetectableCreateProfileRequest) {
  return await undetectableFetch<UndetectableCreateProfileData>("/profile/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export async function undetectableStartProfile(
  id: string,
  opts?: { chrome_flags?: string; start_pages?: string },
) {
  return await undetectableFetch<UndetectableStartProfileData>(`/profile/start/${id}`, {
    method: "GET",
    searchParams: {
      chrome_flags: opts?.chrome_flags,
      "start-pages": opts?.start_pages,
    },
    signal: AbortSignal.timeout(60_000),
  });
}

export async function undetectableStopProfile(id: string) {
  return await undetectableFetch<Record<string, never>>(`/profile/stop/${id}`, {
    method: "GET",
    signal: AbortSignal.timeout(60_000),
  });
}

