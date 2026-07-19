export const MOBILE_UI_METRICS = {
  bottomNavigationHeight: 52,
  compactControlHeight: 36,
  floatingCreateButtonSize: 52,
  floatingSheetCornerRadius: 10,
  minimumTouchTarget: 44,
} as const;

export type MobileMemoFilterMode = "all" | "tagged" | "untagged" | "pinned";

export const toggleMobileMemoFilterMode = (
  current: MobileMemoFilterMode,
  requested: Exclude<MobileMemoFilterMode, "all">
): MobileMemoFilterMode => current === requested ? "all" : requested;

export const toggleMobileMemoSelection = (
  current: ReadonlySet<string>,
  memoId: string
): Set<string> => {
  const next = new Set(current);

  if (next.has(memoId)) {
    next.delete(memoId);
  } else {
    next.add(memoId);
  }

  return next;
};
