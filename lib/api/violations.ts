export const VIOLATION_TYPES = [
  "context-menu",
  "copy",
  "cut",
  "paste",
  "keyboard-shortcut",
  "app-switch"
] as const;

export type ViolationType = (typeof VIOLATION_TYPES)[number];

export const DEFAULT_ENABLED_VIOLATIONS: ViolationType[] = [...VIOLATION_TYPES];

export function normalizeEnabledViolations(value: unknown): ViolationType[] {
  if (!Array.isArray(value)) {
    return DEFAULT_ENABLED_VIOLATIONS;
  }

  return value.filter((item): item is ViolationType =>
    VIOLATION_TYPES.includes(item as ViolationType)
  );
}

export function isViolationEnabled(value: unknown, type: string) {
  const enabledTypes = normalizeEnabledViolations(value);

  return enabledTypes.includes(type as ViolationType);
}
