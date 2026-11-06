import { useQuery } from "@tanstack/react-query";
import { MessageCircleIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { listMemoComments } from "@/api";
import { useI18n } from "@/i18n";
import { memoCommentsQueryKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export const memoCommentsQueryKey = (memoId: string) =>
  ["memo-comments", memoId] as const;

// ================= Twikoo 封装组件 =================
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

  return <div ref={containerRef} className="py-4" />;
};
// ========================================================

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
  const { t } = useI18n();
  const inline = variant === "inline";
  const sectionRef = useRef<HTMLElement | null>(null);
  
  // 保留原生请求（虽然不显示，但为了满足可能的滚动定位逻辑，保留它）
  const commentsQuery = useQuery({
    queryKey: memoCommentsQueryKey(memoId),
    queryFn: () => listMemoComments(memoId),
  });
  
  useEffect(() => {
    if (inline || !commentsQuery.data) return;
    if (window.location.hash !== "#comments") return;
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [commentsQuery.data, inline]);

  // 用 void 消除 TypeScript 对未使用变量的警告
  void canComment;
  void mentions;
  void autoFocus;

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

      {/* 👇 Twikoo 接管评论区域 👇 */}
      <TwikooComment memoId={memoId} />
    </section>
  );
}
