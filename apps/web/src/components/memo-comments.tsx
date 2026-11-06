import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessageCircleIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createMemoComment,
  listMemoComments,
  listMentionableUsers,
  type Memo,
  trashMemo,
} from "@/api";
import { SendButton } from "@/components/composer/send-button";
import { LazyMemoContent } from "@/components/lazy-memo-content";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import { formatMemoRelativeTime, formatMemoTime } from "@/lib/memo";
import {
  extractActiveMentionToken,
  filterMentionSuggestions,
  type MentionCandidate,
} from "@/lib/mention-autocomplete";
import { queryKeys } from "@/lib/query-keys";
import { cn, stripResourceName } from "@/lib/utils";

export const memoCommentsQueryKey = (memoId: string) =>
  ["memo-comments", memoId] as const;

const INLINE_LIMIT = 5;

const drafts = new Map<string, string>();

// ================= 新增：Twikoo 封装组件 =================
const TwikooComment = ({ memoId }: { memoId: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    
    const loadTwikoo = () => {
      if (document.getElementById('twikoo-script')) {
        initTwikoo();
        return;
      }
      const script = document.createElement('script');
      script.id = 'twikoo-script';
      script.src = 'https://registry.npmmirror.com/twikoo/2.0.17/files/dist/twikoo.min.js';
      script.async = true;
      script.onload = () => {
        if (isMounted) initTwikoo();
      };
      document.body.appendChild(script);
    };

    const initTwikoo = () => {
      // @ts-ignore
      if (typeof window.twikoo !== 'undefined' && containerRef.current) {
        containerRef.current.innerHTML = '';
        // @ts-ignore
        window.twikoo.init({
          envId: 'https://tk.mrhe.net',
          el: containerRef.current,
          path: `/memos/${memoId}`,
          lang: 'zh-CN',
        });
      }
    };

    loadTwikoo();

    return () => {
      isMounted = false;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [memoId]);

  // 使用 tailwind 留出内边距
  return <div ref={containerRef} className="py-4" />;
};
// ========================================================

function CommentRow({
  comment,
  locale,
  onDelete,
}: {
  comment: Memo;
  locale: string;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  const name = comment.creator_name || comment.creator;
  return (
    <li className="group/comment flex gap-2.5 py-2.5">
      <Avatar className="mt-0.5 shrink-0" name={name} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex h-5 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate font-medium text-foreground/85">
            {name}
          </span>
          <span aria-hidden="true">·</span>
          <time
            className="shrink-0"
            dateTime={comment.create_time}
            title={formatMemoTime(comment.create_time, locale)}
          >
            {formatMemoRelativeTime(comment.create_time, locale)}
          </time>
          {onDelete && (
            <Button
              aria-label={t("comments.delete")}
              className="ms-auto opacity-0 group-hover/comment:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
              size="icon-xs"
              type="button"
              variant="ghost"
              onClick={onDelete}
            >
              <Trash2Icon />
            </Button>
          )}
        </div>
        <LazyMemoContent
          className="text-sm leading-relaxed"
          content={comment.content}
        />
      </div>
    </li>
  );
}

function CommentComposer({
  autoFocus,
  memoId,
  mentions,
  onSubmitted,
}: {
  autoFocus?: boolean;
  memoId: string;
  mentions: boolean;
  onSubmitted: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraftState] = useState(() => drafts.get(memoId) ?? "");
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const setDraft = (value: string) => {
    setDraftState(value);
    if (value) drafts.set(memoId, value);
    else drafts.delete(memoId);
  };

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const token = mentions ? extractActiveMentionToken(draft, caret) : null;
  const tokenKey = token ? `${token.start}:${token.token}` : null;
  const peopleQuery = useQuery({
    queryKey: queryKeys.mentionableUsers,
    queryFn: () => listMentionableUsers(),
    enabled: Boolean(token),
    staleTime: 60_000,
  });
  const people: MentionCandidate[] = peopleQuery.data?.members ?? [];
  const suggestions =
    token && tokenKey !== dismissed
      ? filterMentionSuggestions(people, token.token)
      : [];
  const showSuggestions = suggestions.length > 0;
  const highlighted = Math.min(activeIndex, suggestions.length - 1);

  const createMutation = useMutation({
    mutationFn: (content: string) => createMemoComment(memoId, { content }),
    onSuccess: () => {
      setDraft("");
      onSubmitted();
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("comments.createFailed"))),
  });

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || createMutation.isPending) return;
    createMutation.mutate(content);
  };

  const accept = (person: MentionCandidate) => {
    if (!token) return;
    const before = draft.slice(0, token.start);
    const after = draft.slice(caret);
    const insert = `@${person.username} `;
    const next = `${before}${insert}${after}`;
    const nextCaret = before.length + insert.length;
    setDraft(next);
    setCaret(nextCaret);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <form onSubmit={submit}>
      <div className="flex items-end gap-2 rounded-xl border border-input bg-card py-1 ps-3 pe-1 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 dark:bg-input/20">
        <textarea
          aria-autocomplete={mentions ? "list" : undefined}
          aria-label={t("comments.placeholder")}
          className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-base leading-5 outline-none [field-sizing:content] placeholder:text-muted-foreground md:text-sm"
          disabled={createMutation.isPending}
          placeholder={
            mentions
              ? t("comments.placeholderMentions")
              : t("comments.placeholder")
          }
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (showSuggestions) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setActiveIndex(
                  (highlighted + step + suggestions.length) %
                    suggestions.length,
                );
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                const person = suggestions[highlighted];
                if (person) accept(person);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDismissed(tokenKey);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          onSelect={(event) =>
            setCaret(event.currentTarget.selectionStart ?? 0)
          }
        />
        <SendButton
          canSubmit={Boolean(draft.trim())}
          isPending={createMutation.isPending}
        />
      </div>
      {showSuggestions && (
        <div
          aria-label={t("comments.mentionList")}
          className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border/60 bg-popover p-1 shadow-sm motion-safe:animate-rise"
          role="listbox"
        >
          {suggestions.map((person, index) => (
            <div
              aria-selected={index === highlighted}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground",
                index === highlighted && "bg-muted text-foreground",
              )}
              key={person.username}
              role="option"
              tabIndex={-1}
              onMouseDown={(event) => {
                event.preventDefault();
                accept(person);
              }}
              onMouseMove={() => setActiveIndex(index)}
            >
              <Avatar name={person.displayName} size="xs" />
              <span className="truncate text-foreground">
                {person.displayName}
              </span>
              <span className="truncate text-xs">@{person.username}</span>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}

export function MemoComments({
  memoId,
  canComment,
  mentions = false,
  variant = "page",
  autoFocus = false,
}: {
  memoId: string;
  canComment: boolean;
  mentions?: boolean;
  variant?: "page" | "inline";
  autoFocus?: boolean;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  
  // 为了不报错，保留原有的 query 逻辑（即使不显示）
  const commentsQuery = useQuery({
    queryKey: memoCommentsQueryKey(memoId),
    queryFn: () => listMemoComments(memoId),
  });

  const inline = variant === "inline";
  const sectionRef = useRef<HTMLElement | null>(null);
  
  useEffect(() => {
    if (inline || !commentsQuery.data) return;
    if (window.location.hash !== "#comments") return;
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [commentsQuery.data, inline]);

  return (
    <section
      aria-label={t("comments.title")}
      className={cn(
        "flex flex-col border-t border-border/60",
        inline ? "mt-1 gap-1 pt-1" : "gap-2 pt-4",
      )}
      id={inline ? undefined : "comments"}
      ref={sectionRef}
    >
      {/* 标题 */}
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <MessageCircleIcon className="size-4 text-muted-foreground" />
        评论
      </h2>

      {/* 👇 直接用 Twikoo 替换掉了原有的评论列表和输入框 👇 */}
      <TwikooComment memoId={memoId} />
      
    </section>
  );
}
