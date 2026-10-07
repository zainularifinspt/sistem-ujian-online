"use client";

import { memo, useEffect, useRef, useState } from "react";

type ExamCountdownProps = {
  expiresAt: string;
  isPaused: boolean;
  onExpire: () => void;
};

function formatRemaining(ms: number) {
  const totalSeconds = Math.floor(Math.max(ms, 0) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export const ExamCountdown = memo(function ExamCountdown({
  expiresAt,
  isPaused,
  onExpire
}: ExamCountdownProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(new Date(expiresAt).getTime() - Date.now(), 0)
  );
  const onExpireRef = useRef(onExpire);

  // Keep the latest answers/submission callback without restarting the clock.
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (isPaused) {
      return;
    }

    const deadline = new Date(expiresAt).getTime();
    const tick = () => {
      const remaining = deadline - Date.now();
      setRemainingMs(Math.max(remaining, 0));

      if (remaining <= 0) {
        onExpireRef.current();
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);

    return () => window.clearInterval(intervalId);
  }, [expiresAt, isPaused]);

  return (
    <p className="mt-2 font-mono text-xl font-black lg:text-3xl">
      {formatRemaining(remainingMs)}
    </p>
  );
});
