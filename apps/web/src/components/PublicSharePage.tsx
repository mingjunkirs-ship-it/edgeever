import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EditorContent, useEditor } from "@tiptap/react";
import { Clock3, Download, FileText, LockKeyhole, ShieldCheck } from "lucide-react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ApiRequestError, api } from "@/lib/api";
import { createPublicShareExtensions } from "@/lib/public-share-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TiptapDoc } from "@edgeever/shared";

export const PublicSharePage = () => {
  const { token = "" } = useParams();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [readingProgress, setReadingProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const query = useQuery({ queryKey: ["public-share", token], queryFn: () => api.getPublicMemoShare(token), retry: false });
  const share = query.data?.share;
  const unlock = useMutation({
    mutationFn: () => api.unlockPublicMemoShare(token, password),
    onSuccess: async () => { setPassword(""); await queryClient.invalidateQueries({ queryKey: ["public-share", token] }); },
  });
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow,noarchive";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);
  useEffect(() => {
    if (share?.memo?.title) document.title = `${share.memo.title} · EdgeEver`;
    return () => { document.title = "EdgeEver"; };
  }, [share?.memo?.title]);
  if (query.isLoading) return <PublicLoading label={t("publicShare.loading")} />;
  if (query.isError || !share) return <PublicState><FileText className="mb-3 h-8 w-8 text-slate-400" />{t("publicShare.unavailable")}</PublicState>;
  if (!share.unlocked) {
    return (
      <PublicState>
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/80 bg-white/95 p-7 text-left shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-9">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 shadow-inner"><LockKeyhole className="h-6 w-6" /></div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">EdgeEver</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">{t("publicShare.passwordTitle")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">{t("publicShare.passwordDescription")}</p>
          <form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); unlock.mutate(); }}>
            <Input className="h-11 rounded-xl" autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("publicShare.passwordPlaceholder")} />
            {unlock.error instanceof Error && (
              <p className="text-sm text-rose-600">
                {unlock.error instanceof ApiRequestError && unlock.error.code === "share_unlock_rate_limited"
                  ? t("publicShare.rateLimited")
                  : t("publicShare.passwordError")}
              </p>
            )}
            <Button className="h-11 w-full justify-center rounded-xl" variant="solid" disabled={!password || unlock.isPending}>{unlock.isPending ? t("publicShare.unlocking") : t("publicShare.unlock")}</Button>
          </form>
        </div>
      </PublicState>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="public-share-page h-[100dvh] overflow-y-auto bg-slate-100 scroll-smooth"
      onScroll={(event) => {
        const element = event.currentTarget;
        const available = element.scrollHeight - element.clientHeight;
        setReadingProgress(available > 0 ? Math.min(100, (element.scrollTop / available) * 100) : 0);
      }}
    >
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-slate-200/70">
        <div className="h-full bg-emerald-500 transition-[width] duration-150 ease-out" style={{ width: `${readingProgress}%` }} />
      </div>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 -top-40 h-96 w-96 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-sky-100/60 blur-3xl" />
      </div>
      <main className="relative mx-auto min-h-full max-w-[860px] border-x border-white/70 bg-white/95 px-5 py-7 shadow-[0_0_80px_rgba(15,23,42,0.06)] backdrop-blur sm:px-12 sm:py-10 lg:px-20 lg:py-14">
        <div className="mb-12">
          <div className="mb-10 flex items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 text-sm font-bold tracking-tight text-slate-800">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-black text-white shadow-sm">E</span>
              EdgeEver
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50/80 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />{t("publicShare.readOnlyLabel")}
            </span>
          </div>
          <h1 className="max-w-3xl text-[2.35rem] font-extrabold leading-[1.12] tracking-[-0.035em] text-slate-950 sm:text-5xl">{share.memo?.title || t("common.untitledMemo")}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1.5"><Clock3 className="h-3.5 w-3.5" />{t("publicShare.updatedAt", { value: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(share.memo?.updatedAt ?? "")) })}</span>
            {share.memo?.tags.map((tag) => <span key={tag} className="rounded-full border border-slate-200/80 bg-white px-3 py-1.5 font-medium text-slate-600">#{tag}</span>)}
          </div>
        </div>
        <article className="public-share-content">
          {share.memo && <SharedMemoContent key={`${share.memo.id}:${share.memo.updatedAt}`} content={share.memo.contentJson} />}
        </article>
        {share.allowAttachments && share.attachments.length > 0 && (
          <section className="mt-14 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5">
            <h2 className="text-sm font-bold text-slate-800">{t("publicShare.attachments")}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {share.attachments.map((attachment) => (
                <a key={attachment.id} href={attachment.url} download className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
                  <span className="min-w-0"><span className="block truncate font-medium">{attachment.filename || attachment.id}</span><span className="mt-0.5 block text-[11px] text-slate-400">{formatFileSize(attachment.byteSize)}</span></span><Download className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-emerald-600" />
                </a>
              ))}
            </div>
          </section>
        )}
        <footer className="mt-16 border-t border-slate-100 pb-3 pt-7 text-center text-xs leading-5 text-slate-400">{t("publicShare.readOnly")}</footer>
      </main>
    </div>
  );
};

const PublicState = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[100dvh] flex-col items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(167,243,208,0.35),transparent_38%),#f8fafc] px-5 text-center text-sm text-slate-600">{children}</div>
);

const PublicLoading = ({ label }: { label: string }) => (
  <PublicState>
    <div className="w-full max-w-2xl animate-pulse rounded-3xl border border-white bg-white/90 p-7 text-left shadow-xl sm:p-12">
      <div className="h-7 w-28 rounded-lg bg-emerald-100" />
      <div className="mt-10 h-11 w-4/5 rounded-xl bg-slate-200" />
      <div className="mt-4 h-4 w-2/5 rounded bg-slate-100" />
      <div className="mt-12 space-y-3"><div className="h-4 rounded bg-slate-100" /><div className="h-4 rounded bg-slate-100" /><div className="h-4 w-4/6 rounded bg-slate-100" /></div>
      <div className="mt-8 text-center text-xs font-medium text-slate-400">{label}</div>
    </div>
  </PublicState>
);

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const SharedMemoContent = ({ content }: { content: TiptapDoc }) => {
  const editor = useEditor({
    extensions: createPublicShareExtensions(),
    content,
    editable: false,
    editorProps: { attributes: { class: "ProseMirror min-h-0 px-0 py-0" } },
  });

  return <EditorContent editor={editor} />;
};
