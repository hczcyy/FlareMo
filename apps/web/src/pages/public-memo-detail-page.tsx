import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { getPublicMemo } from "@/api";
import { FlareMoLogo } from "@/components/flaremo-logo";
import { TwikooComment } from "@/components/memo-comments";
import { MemoReadingView } from "@/components/reading/memo-reading-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { formatMemoTime } from "@/lib/memo";
import { queryKeys } from "@/lib/query-keys";

/**
 * The anonymous detail page behind the explore timeline's timestamps
 * (/explore/:memoId). Same server boundary as the timeline — the anonymous
 * read scope — and the same Twikoo thread path (`/memos/{id}`) the signed-in
 * detail page uses, so public visitors and signed-in members share one
 * conversation per memo.
 */
export function PublicMemoDetailPage({ memoId }: { memoId: string }) {
  const { locale, t } = useI18n();
  const memoQuery = useQuery({
    queryKey: queryKeys.publicMemo(memoId),
    queryFn: ({ signal }) => getPublicMemo(memoId, signal),
    retry: false,
  });

  return (
    <div className="min-h-svh bg-background px-4 py-6 sm:py-10">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header className="flex items-center justify-between border-b pb-4">
          <FlareMoLogo labelClassName="text-lg" markClassName="size-7" />
          <Link
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            to="/explore"
          >
            <ArrowLeftIcon className="size-4" />
            {t("explore.back")}
          </Link>
        </header>
        {memoQuery.isLoading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}
        {memoQuery.isError && (
          // Same semantics as a share link that no longer resolves: the memo
          // is gone, not public, or the id is wrong.
          <Empty className="min-h-72 border">
            <EmptyHeader>
              <EmptyTitle>{t("share.unavailable")}</EmptyTitle>
              <EmptyDescription>
                {t("share.unavailableDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {memoQuery.data && (
          <Card className="overflow-clip">
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {memoQuery.data.creator_name ?? t("explore.anonymous")}
                {" · "}
                {formatMemoTime(memoQuery.data.display_time, locale)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <MemoReadingView
                attachments={memoQuery.data.attachments ?? []}
                content={memoQuery.data.content}
                contentClassName="text-base"
              />
              {/* The Twikoo thread is keyed by the bare memo id — identical
                  to the signed-in detail page's comment section. */}
              <TwikooComment memoId={memoQuery.data.id} />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
