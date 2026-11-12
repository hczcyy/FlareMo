import type { ListMemosResponse, MemoDto } from "@flaremo/contracts";
import { apiRequest } from "./client";

export type ListPublicMemosParams = {
  page_size?: number;
  page_token?: string;
};

/**
 * Anonymous explore timeline (GET /api/public/memos). The server pins the
 * viewer to anonymous, so the corpus is exactly the world-readable normal
 * memos — no credential, no Origin requirement, no auth-required event.
 */
export async function listPublicMemos(
  params: ListPublicMemosParams = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();
  query.set("page_size", String(params.page_size ?? 20));
  if (params.page_token) query.set("page_token", params.page_token);
  return apiRequest<ListMemosResponse>(
    `/api/public/memos?${query.toString()}`,
    {
      signal,
    },
    { authRequired: false },
  );
}

/** Anonymous single memo (GET /api/public/memos/:id) for the detail page. */
export async function getPublicMemo(memoId: string, signal?: AbortSignal) {
  return apiRequest<MemoDto>(
    `/api/public/memos/${encodeURIComponent(memoId)}`,
    { signal },
    { authRequired: false },
  );
}
