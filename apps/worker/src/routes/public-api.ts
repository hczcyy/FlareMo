import type { MemoDto } from "@flaremo/contracts";
import type { AttachmentRow, MemoRow } from "@flaremo/db";
import {
  getAttachmentById,
  getFlaremoUserNames,
  getMemoByIdForViewer,
  getPublicArticleAttachment,
  getPublicShareByToken,
  listAttachmentsForMemosForViewer,
  listMemosForViewer,
} from "@flaremo/domain";
import {
  attachmentToDto,
  memoToDto,
  parseMemosResourceName,
  shareToDto,
} from "@flaremo/memos";
import { Hono } from "hono";
import { z } from "zod";
import { attachmentObjectResponse } from "../attachment-http";
import { getFlareMoDb, type HonoBindings } from "../context";
import { jsonError } from "../http";
import { zValidator } from "../validated";

export const publicApi = new Hono<HonoBindings>();

// Page shape for the anonymous /explore timeline: newest first, cursor
// pagination, no filtering knobs — the corpus is exactly the world-readable
// normal memos, so anything richer would only widen the query surface.
const publicListMemosQuerySchema = z.object({
  page_size: z.coerce.number().int().min(1).max(50).default(20),
  page_token: z.string().optional(),
});

// Anonymous visitors may only fetch files through the /file compatibility
// bridge (the anonymous branch there re-checks memo visibility), so the DTO's
// authenticated /api/v1 blob URLs are rewritten to that bridge.
function publicAttachmentDto(attachment: AttachmentRow) {
  const dto = attachmentToDto(attachment);
  const fileUrl = `/file/attachments/${dto.id}/${encodeURIComponent(dto.filename)}`;
  return {
    ...dto,
    download_url: fileUrl,
    preview_url: fileUrl,
    ...(dto.thumbnail_url
      ? { thumbnail_url: `${fileUrl}?thumbnail=true` }
      : {}),
  };
}

function publicMemoDto(
  memo: MemoRow,
  creatorName: string | undefined,
  attachments: AttachmentRow[] | undefined,
): MemoDto {
  return {
    ...memoToDto(memo, null, creatorName),
    ...(attachments
      ? { attachments: attachments.map(publicAttachmentDto) }
      : {}),
  };
}

// The anonymous explore timeline: the same list service the Memos API uses,
// with the viewer pinned to anonymous — memoReadScope(null) restricts the
// corpus to public, normal memos, and the explicit visibility/state filters
// keep that intent readable at the call site.
publicApi.get(
  "/memos",
  zValidator("query", publicListMemosQuerySchema),
  async (c) => {
    try {
      const db = getFlareMoDb(c.env);
      const { page_size, page_token } = c.req.valid("query");
      const result = await listMemosForViewer(db, null, {
        page_size,
        page_token,
        order_by: "created_at desc",
        include_deleted: false,
        visibility: "public",
        state: "normal",
      });
      const [creatorNames, attachments] = await Promise.all([
        getFlaremoUserNames(
          db,
          result.memos.map((memo) => memo.userId),
        ),
        listAttachmentsForMemosForViewer(
          db,
          null,
          result.memos.map((memo) => memo.id),
        ),
      ]);
      const byMemo = new Map<string, AttachmentRow[]>();
      for (const attachment of attachments) {
        if (!attachment.memoId) continue;
        const values = byMemo.get(attachment.memoId) ?? [];
        values.push(attachment);
        byMemo.set(attachment.memoId, values);
      }
      return c.json({
        memos: result.memos.map((memo) =>
          publicMemoDto(
            memo,
            creatorNames.get(memo.userId),
            byMemo.get(memo.id),
          ),
        ),
        ...(result.nextPageToken
          ? { next_page_token: result.nextPageToken }
          : {}),
      });
    } catch (error) {
      return jsonError(c, error);
    }
  },
);

// Single public memo for the anonymous detail page (/explore/:memoId). The
// anonymous read scope is the authorization boundary: a non-public or
// non-normal memo answers 404, never a permission error.
publicApi.get("/memos/:memoId", async (c) => {
  try {
    const db = getFlareMoDb(c.env);
    const memo = await getMemoByIdForViewer(
      db,
      null,
      parseMemosResourceName(c.req.param("memoId")),
    );
    const [creatorNames, attachments] = await Promise.all([
      getFlaremoUserNames(db, [memo.userId]),
      listAttachmentsForMemosForViewer(db, null, [memo.id]),
    ]);
    return c.json(
      publicMemoDto(
        memo,
        creatorNames.get(memo.userId),
        attachments.filter((a) => a.memoId === memo.id),
      ),
    );
  } catch (error) {
    return jsonError(c, error);
  }
});

publicApi.get("/shares/:token", async (c) => {
  try {
    const db = getFlareMoDb(c.env);
    const share = await getPublicShareByToken(db, c.req.param("token"));
    const shareDto = shareToDto(share.share);
    return c.json({
      share: {
        name: shareDto.name,
        id: shareDto.id,
        memo: shareDto.memo,
        expires_at: shareDto.expires_at,
        create_time: shareDto.create_time,
      },
      memo: memoToDto(share.memo, share.user, share.user.name),
      attachments: share.attachments.map((attachment) => {
        const blobUrl = `/api/public/shares/${share.share.token}/attachments/${attachment.id.replace(/^attachments\//, "")}/blob`;
        return {
          ...attachmentToDto(attachment),
          download_url: blobUrl,
          preview_url: `${blobUrl}?preview=1`,
          ...(attachment.payload?.thumbnail === true
            ? { thumbnail_url: `${blobUrl}?preview=1&thumbnail=true` }
            : {}),
        };
      }),
    });
  } catch (error) {
    return jsonError(c, error);
  }
});

publicApi.get("/shares/:token/attachments/:id/blob", async (c) => {
  try {
    const db = getFlareMoDb(c.env);
    const share = await getPublicShareByToken(db, c.req.param("token"));
    const attachment = await getAttachmentById(
      db,
      share.user,
      c.req.param("id"),
    );
    if (attachment.memoId !== share.memo.id) {
      return c.json({ error: { message: "Attachment not found" } }, 404);
    }

    const response = await attachmentObjectResponse({
      attachment,
      bucket: c.env.ATTACHMENTS,
      cacheControl: "public, max-age=3600",
      inlineRequested:
        c.req.query("preview") === "1" || c.req.query("thumbnail") === "true",
      thumbnailRequested: c.req.query("thumbnail") === "true",
      request: c.req.raw,
    });
    if (!response) {
      return c.json({ error: { message: "Attachment object not found" } }, 404);
    }
    return response;
  } catch (error) {
    return jsonError(c, error);
  }
});

// Article public blob: binding to the *published* article is the access
// check (mirrors the share-token contract; anonymous + cacheable).
publicApi.get("/articles/:slug/attachments/:id/blob", async (c) => {
  try {
    const db = getFlareMoDb(c.env);
    const { attachment } = await getPublicArticleAttachment(
      db,
      c.req.param("slug"),
      c.req.param("id"),
    );
    const response = await attachmentObjectResponse({
      attachment,
      bucket: c.env.ATTACHMENTS,
      cacheControl: "public, max-age=3600",
      inlineRequested:
        c.req.query("preview") === "1" || c.req.query("thumbnail") === "true",
      thumbnailRequested: c.req.query("thumbnail") === "true",
      request: c.req.raw,
    });
    if (!response) {
      return c.json({ error: { message: "Attachment object not found" } }, 404);
    }
    return response;
  } catch (error) {
    return jsonError(c, error);
  }
});
