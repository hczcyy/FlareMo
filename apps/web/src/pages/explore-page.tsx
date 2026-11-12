import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listPublicMemos } from "@/api";
import { FlareMoLogo } from "@/components/flaremo-logo";
import { MemoReadingView } from "@/components/reading/memo-reading-view";
import { Button } from "@/components/ui/button";
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

const PAGE_SIZE = 20;

/**
 * The anonymous explore timeline (mirrors Memos' /explore): every
 * world-readable memo, no session required. The server pins the viewer to
 * anonymous, so the page can only ever render what is already public.
 */
export function ExplorePage() {
  const { locale, t } = useI18n();
  const timelineQuery = useInfiniteQuery({
    queryKey: queryKeys.exploreMemos,
    queryFn: ({ pageParam, signal }) =>
      listPublicMemos(
        pageParam
          ? { page_size: PAGE_SIZE, page_token: pageParam }
          : { page_size: PAGE_SIZE },
        signal,
      ),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.next_page_token ?? undefined,
  });

  const memos = timelineQuery.data?.pages.flatMap((page) => page.memos) ?? [];
  const hasMore = Boolean(timelineQuery.hasNextPage);

  return (
    <div className="min-h-svh bg-background px-4 py-6 sm:py-10">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header className="flex items-center justify-between border-b pb-4">
          <FlareMoLogo labelClassName="text-lg" markClassName="size-7" />
          <Button render={<Link to="/login" />} size="sm" variant="ghost">
            {t("explore.signIn")}
          </Button>
        </header>
        <div>
          <h1 className="text-xl font-semibold">{t("explore.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("explore.description")}
          </p>
        </div>
        {timelineQuery.isLoading && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}
        {timelineQuery.isError && (
          <Empty className="min-h-72 border">
            <EmptyHeader>
              <EmptyTitle>{t("explore.loadFailed")}</EmptyTitle>
              <EmptyDescription>{t("explore.loadFailedHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {timelineQuery.isSuccess && memos.length === 0 && (
          <Empty className="min-h-72 border">
            <EmptyHeader>
              <EmptyTitle>{t("explore.empty")}</EmptyTitle>
              <EmptyDescription>{t("explore.emptyHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {memos.map((memo) => (
          <Card key={memo.name}>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {memo.creator_name ?? t("explore.anonymous")}
                {" · "}
                {/* The timestamp deep-links to the public detail page, where
                    the Twikoo thread lives — same memoId as the signed-in
                    detail, so both share one conversation. */}
                <Link
                  className="transition-colors hover:text-foreground"
                  params={{ memoId: memo.id }}
                  to="/explore/$memoId"
                >
                  {formatMemoTime(memo.display_time, locale)}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <MemoReadingView
                attachments={memo.attachments ?? []}
                content={memo.content}
                contentClassName="text-base"
                layout="card"
              />
            </CardContent>
          </Card>
        ))}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              disabled={timelineQuery.isFetchingNextPage}
              onClick={() => void timelineQuery.fetchNextPage()}
              variant="outline"
            >
              {timelineQuery.isFetchingNextPage
                ? t("explore.loading")
                : t("explore.loadMore")}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
