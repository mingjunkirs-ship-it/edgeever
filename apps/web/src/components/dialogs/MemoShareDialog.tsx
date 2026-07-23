import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MemoShare } from "@edgeever/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const toLocalDateTime = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export const MemoShareDialog = ({ memoId, open, onOpenChange }: { memoId: string; open: boolean; onOpenChange: (open: boolean) => void }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [requirePassword, setRequirePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowAttachments, setAllowAttachments] = useState(false);
  const [copied, setCopied] = useState(false);
  const query = useQuery({ queryKey: ["memo-share", memoId], queryFn: () => api.getMemoShare(memoId), enabled: open });
  const share = query.data?.share ?? null;

  useEffect(() => {
    if (!open || query.isLoading) return;
    setEnabled(share?.enabled ?? true);
    setRequirePassword(share?.requiresPassword ?? false);
    setPassword("");
    setExpiresAt(toLocalDateTime(share?.expiresAt ?? null));
    setAllowAttachments(share?.allowAttachments ?? false);
    setCopied(false);
  }, [open, query.isLoading, share]);

  const mutation = useMutation({
    mutationFn: () => api.updateMemoShare(memoId, {
      enabled,
      password: requirePassword ? (password || undefined) : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      allowAttachments,
    }),
    onSuccess: (data) => {
      queryClient.setQueryData(["memo-share", memoId], data);
      void queryClient.invalidateQueries({ queryKey: ["memo-shares"] });
    },
  });

  const currentShare: MemoShare | null = mutation.data?.share ?? share;
  const copyLink = async () => {
    if (!currentShare?.url) return;
    await navigator.clipboard.writeText(currentShare.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("share.title")}</DialogTitle>
          <DialogDescription>{t("share.description")}</DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            {currentShare && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800"><Link2 className="h-4 w-4" />{t("share.link")}</div>
                <div className="flex gap-2">
                  <Input readOnly value={currentShare.url} className="bg-white" />
                  <Button size="icon" variant="outline" onClick={() => void copyLink()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
                  <Button size="icon" variant="outline" onClick={() => window.open(currentShare.url, "_blank", "noopener,noreferrer")}><ExternalLink className="h-4 w-4" /></Button>
                </div>
                <p className="mt-2 text-xs text-emerald-700">{t("share.stableLink")}</p>
              </div>
            )}
            <SettingRow label={t("share.enable")} description={t("share.enableDescription")}><Switch checked={enabled} onCheckedChange={setEnabled} /></SettingRow>
            <SettingRow label={t("share.password")} description={share?.requiresPassword ? t("share.passwordExisting") : t("share.passwordDescription")}><Switch checked={requirePassword} onCheckedChange={setRequirePassword} /></SettingRow>
            {requirePassword && <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={share?.requiresPassword ? t("share.passwordKeepPlaceholder") : t("share.passwordPlaceholder")} />}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800" htmlFor="memo-share-expires">{t("share.expiresAt")}</label>
              <Input id="memo-share-expires" type="datetime-local" value={expiresAt} min={toLocalDateTime(new Date(Date.now() + 60_000).toISOString())} onChange={(event) => setExpiresAt(event.target.value)} />
              <p className="text-xs text-slate-500">{t("share.expiresDescription")}</p>
            </div>
            <SettingRow label={t("share.attachments")} description={t("share.attachmentsDescription")}><Switch checked={allowAttachments} onCheckedChange={setAllowAttachments} /></SettingRow>
            {mutation.error instanceof Error && <p className="text-sm text-rose-600">{mutation.error.message}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button
            variant="solid"
            disabled={query.isLoading || mutation.isPending || (requirePassword && (!share?.requiresPassword ? password.length < 8 : Boolean(password) && password.length < 8))}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t("share.saving") : t("share.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SettingRow = ({ label, description, children }: { label: string; description: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-3">
    <div><div className="text-sm font-medium text-slate-800">{label}</div><div className="mt-1 text-xs leading-5 text-slate-500">{description}</div></div>
    {children}
  </div>
);
