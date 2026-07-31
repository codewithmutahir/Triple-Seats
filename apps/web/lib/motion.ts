/**
 * Shared motion vocabulary — CSS-only, no JS animation libs.
 * Prefer these over one-off transition classes so timing stays consistent.
 */
export const motion = {
  /** Chevron that rotates when a collapsible opens. */
  chevron:
    "h-4 w-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
  chevronOpen: "rotate-180",

  /**
   * Soft enter for newly added list rows (opacity + slight rise).
   * Only attach to newly mounted nodes (e.g. optimistic temp_* items).
   */
  listEnter:
    "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200 motion-safe:ease-out",

  /** Standard interactive hover/color transitions. */
  interactive: "transition-colors duration-150 ease-out",

  /** Buttons / chips with a subtle press. */
  pressable:
    "transition-[colors,transform,opacity] duration-150 ease-out motion-safe:active:scale-[0.98]"
} as const;
