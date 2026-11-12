import {
  getAttachmentById,
  getPublicMemoAttachmentById,
  getPublicShareByToken,
} from "@flaremo/domain";
import { type Context, Hono } from "hono";
import { attachmentObjectResponse } from "../attachment-http";
import {
  getFlareMoDb,
  getOptionalRequestContext,
  type HonoBindings,
} from "../context";
import { jsonError } from "../http";

/**
 * Memos Web's attachment URL is not an API resource URL. The official Web
 * client builds `/file/{attachment.name}/{attachment.filename}` directly,
 * so keep this small compatibility bridge separate from `/api/v1`.
 *
 * The filename is only a URL-shape compatibility parameter. Object lookup is
 * always by the resource name and the authenticated/share-scoped owner; a
 * caller can never select an R2 key by supplying a path fragment.
 */
export const memosFileApi = new Hono<HonoBindings>();

memosFileApi.get("/attachments/:attachment/:filename", async (c) => {
  try {
    const attachmentName = normalizeAttachmentName(c.req.param("attachment"));
    const shareToken = c.req.query("share_token");

    if (shareToken) {
      const db = getFlareMoDb(c.env);
      const share = await getPublicShareByToken(db, shareToken);
      const attachment = await getAttachmentById(
        db,
        share.user,
        attachmentName,
      );
      if (attachment.memoId !== share.memo.id) {
        return c.json({ error: { message: "Attachment not found" } }, 404);
      }
      return serveAttachment(c, attachment, "public, max-age=3600");
    }

    // An unresolvable credential (signed-out visitor, stale session cookie,
    // no credential at all) falls back to the public-memo branch: files on
    // world-readable, normal memos stay loadable on public pages such as
    // /explore. Anyone holding a working session/PAT keeps the full read
    // scope — the fallback must never widen what a signed-in viewer sees.
    let context: Awaited<ReturnType<typeof getOptionalRequestContext>> | null =
      null;
    try {
      context = await getOptionalRequestContext(c);
    } catch {
      context = null;
    }
    if (context?.user) {
      const attachment = await getAttachmentById(
        context.db,
        context.user,
        attachmentName,
      );
      return serveAttachment(c, attachment, "private, max-age=3600");
    }

    const attachment = await getPublicMemoAttachmentById(
      context?.db ?? getFlareMoDb(c.env),
      attachmentName,
    );
    return serveAttachment(c, attachment, "public, max-age=3600");
  } catch (error) {
    return jsonError(c, error);
  }
});

async function serveAttachment(
  c: Context<HonoBindings>,
  attachment: Awaited<ReturnType<typeof getAttachmentById>>,
  cacheControl: string,
) {
  const response = await attachmentObjectResponse({
    attachment,
    bucket: c.env.ATTACHMENTS,
    cacheControl,
    inlineRequested:
      c.req.query("thumbnail") === "true" ||
      c.req.query("preview") === "1" ||
      c.req.query("disposition") === "inline",
    thumbnailRequested: c.req.query("thumbnail") === "true",
    request: c.req.raw,
  });
  if (!response) {
    return c.json({ error: { message: "Attachment object not found" } }, 404);
  }
  return response;
}

function normalizeAttachmentName(value: string) {
  return value.startsWith("attachments/") ? value : `attachments/${value}`;
}
