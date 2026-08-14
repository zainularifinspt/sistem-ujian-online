"use client";

import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import type { MathfieldElement } from "mathlive";

import { cn } from "@/lib/utils";
import { unwrapMathAnswer, wrapMathAnswer } from "@/lib/math-answer";

type MathAnswerInputProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

export function MathAnswerInput({
  ariaLabel = "Jawaban dalam bentuk rumus matematika",
  className,
  disabled = false,
  id,
  onChange,
  placeholder = "Ketik rumus matematika",
  value
}: MathAnswerInputProps) {
  const fieldRef = useRef<MathfieldElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const latexValue = unwrapMathAnswer(value);

  useEffect(() => {
    let isMounted = true;

    void import("mathlive").then(({ MathfieldElement }) => {
      MathfieldElement.fontsDirectory = null;
      MathfieldElement.soundsDirectory = null;

      if (isMounted) {
        setIsReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const field = fieldRef.current;

    if (!field) {
      return;
    }

    field.mathVirtualKeyboardPolicy = "auto";
    field.placeholder = placeholder;
    field.readOnly = disabled;
    field.smartFence = true;

    if (field.value !== latexValue) {
      field.setValue(latexValue, { silenceNotifications: true });
    }
  }, [disabled, isReady, latexValue, placeholder]);

  const setFieldRef = useCallback((element: HTMLElement | null) => {
    fieldRef.current = element as MathfieldElement | null;
  }, []);

  if (!isReady) {
    return (
      <div
        aria-label="Menyiapkan editor rumus"
        className={cn(
          "math-answer-field flex min-h-12 items-center text-sm text-slate-400",
          className
        )}
      >
        Menyiapkan editor rumus...
      </div>
    );
  }

  return createElement("math-field", {
    "aria-label": ariaLabel,
    "aria-disabled": disabled,
    className: cn("math-answer-field", className),
    id,
    onInput: (event: Event) => {
      const field = event.currentTarget as MathfieldElement;
      onChange(wrapMathAnswer(field.value));
    },
    ref: setFieldRef
  });
}
