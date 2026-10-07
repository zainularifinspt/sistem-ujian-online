"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  ListChecks,
  LockKeyhole,
  Pause,
  Save,
  Send,
  ShieldAlert
} from "lucide-react";

import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MathContent } from "@/components/math-content";
import { ExamCountdown } from "@/components/exam-countdown";
import { AnswerSync, type Draft, type PendingAnswer } from "@/lib/answer-sync";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AnswerFormat } from "@/lib/math-answer";
import {
  normalizeEnabledViolations,
  type ViolationType
} from "@/lib/api/violations";

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
};

type StudentQuestion = {
  answerFormat: AnswerFormat;
  id: string;
  imageUrl: string | null;
  options: { id: string; imageUrl?: string | null; text: string }[] | null;
  order: number;
  prompt: string;
  score: number;
  type: "multiple_choice" | "short_answer" | "essay";
};

type StudentExamPayload = {
  answers?: Record<string, string>;
  exam: {
    description: string | null;
    durationMinutes: number;
    id: string;
    name: string;
    shuffleOptions: boolean;
    shuffleQuestions: boolean;
    enabledViolationTypes: ViolationType[];
    violationLimit: number;
  };
  participant: {
    className: string;
    name: string;
    nim: string;
    prodi: string;
  };
  questions: StudentQuestion[];
  session: {
    expiresAt: string;
    id: string;
    startedAt: string;
    status: string;
    answerRevision: number;
    writerId: string;
  };
};

type ViolationPayload = {
  autoSubmitted: boolean;
  ignored?: boolean;
  totalViolations: number;
  violationLimit: number;
};

type SubmitPayload = {
  score?: number;
  status?: string;
  unsavedAnswers?: boolean;
};

type SessionStatusPayload = {
  id: string;
  status: string;
  submittedAt: string | null;
  expiresAt?: string;
};

type StudentExamClientProps = {
  initialToken: string;
};

class StudentApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function studentApiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!response.ok) {
    throw new StudentApiError(payload.error ?? "Request gagal.", response.status);
  }

  return payload.data as T;
}

function questionTypeLabel(type: StudentQuestion["type"]) {
  if (type === "multiple_choice") {
    return "Pilihan Ganda";
  }

  if (type === "short_answer") {
    return "Isian Singkat";
  }

  return "Esai";
}

function violationTypeLabel(type: string, metadata?: Record<string, unknown>) {
  if (type === "context-menu") {
    return "Klik kanan";
  }

  if (type === "copy") {
    return "Menyalin jawaban atau teks";
  }

  if (type === "cut") {
    return "Memotong teks";
  }

  if (type === "paste") {
    return "Menempel teks";
  }

  if (type === "keyboard-shortcut") {
    const key = typeof metadata?.key === "string" ? metadata.key.toUpperCase() : "";

    return key ? `Shortcut keyboard (${key})` : "Shortcut keyboard terlarang";
  }

  if (type === "app-switch") {
    return "Berpindah tab atau aplikasi";
  }

  return "Aktivitas terlarang";
}

export default function StudentExamClient({
  initialToken
}: StudentExamClientProps) {
  const reducedMotion = useReducedMotion();
  const [nim, setNim] = useState("");
  const [token, setToken] = useState(
    initialToken
      .replace(/[^a-z]/gi, "")
      .toUpperCase()
      .slice(0, 4)
  );
  const [examData, setExamData] = useState<StudentExamPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"forward" | "backward">("forward");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Belum ada sesi aktif");
  const [reviewDraft, setReviewDraft] = useState<PendingAnswer[]>([]);
  const [submitted, setSubmitted] = useState<SubmitPayload | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [violationPopup, setViolationPopup] = useState<{
    count: number;
    message: string;
    title: string;
  } | null>(null);
  const answerSync = useRef<AnswerSync | null>(null);
  const saveTimer = useRef<number | null>(null);
  const submitLock = useRef(false);
  const restoreRequest = useRef<Promise<StudentExamPayload & { violations?: number }> | null>(null);
  const violationCooldown = useRef<Record<string, number>>({});
  const retryAfter = useRef(0);
  const saveFailures = useRef(0);

  const installExam = useCallback((payload: StudentExamPayload & { violations?: number }) => {
    answerSync.current?.stop();
    setError("");
    const draftKey = `exam_draft_${payload.session.id}`;
    const serverAnswers = payload.answers ?? {};
    let restored: Draft | null = null;
    try {
      const parsed = JSON.parse(localStorage.getItem(draftKey) ?? "null") as Draft | null;
      if (parsed && Number.isInteger(parsed.revision) && parsed.answers && typeof parsed.answers === "object") {
        const allowed = new Set(payload.questions.map((question) => question.id));
        restored = { revision: parsed.revision, answers: Object.fromEntries(Object.entries(parsed.answers)
          .filter(([id, value]) => allowed.has(id) && typeof value === "string" && value.length <= 50000)) };
      }
    } catch { setNotice("Penyimpanan draf perangkat tidak tersedia. Pastikan status jawaban tersimpan sebelum menutup halaman."); }
    const sync = new AnswerSync(payload.session.answerRevision, async (items, revision) => {
      setSaveStatus("Menyimpan...");
      const result = await studentApiRequest<{ revision: number }>(`/api/exam/sessions/${payload.session.id}/answers`, {
        method: "PATCH", body: JSON.stringify({ answers: items, expectedRevision: revision, writerId: payload.session.writerId })
      });
      return result.revision;
    }, (draft) => {
      try {
        if (Object.keys(draft.answers).length) localStorage.setItem(draftKey, JSON.stringify(draft));
        else localStorage.removeItem(draftKey);
      } catch { setNotice("Draf belum dapat disimpan di perangkat. Jangan tutup halaman sebelum jawaban tersimpan di server."); }
    });
    answerSync.current = sync;
    const closed = ["submitted", "auto_submitted", "expired"].includes(payload.session.status);
    const canRestore = restored && sync.restore(restored);
    setReviewDraft(restored && !canRestore ? Object.entries(restored.answers).map(([questionId, answer]) => ({ questionId, answer })) : []);
    if (restored && !canRestore && !closed) setNotice("Ada draf lama dengan versi berbeda. Draf tetap tersimpan di perangkat dan tidak menimpa jawaban server.");
    setExamData(payload);
    setNim(payload.participant.nim);
    setAnswers(canRestore && restored ? { ...serverAnswers, ...restored.answers } : serverAnswers);
    setCurrentIndex(0);
    setSubmitted(closed ? { status: payload.session.status } : null);
    setViolationCount(payload.violations ?? 0);
    setSaveStatus(sync.size ? "Draf dipulihkan, menunggu sinkronisasi" : closed ? "Sesi selesai" : "Sesi aktif");
    saveFailures.current = 0;
    retryAfter.current = 0;
    if (closed) sync.stop();
    try {
      if (closed) sessionStorage.removeItem("exam_session_id");
      else sessionStorage.setItem("exam_session_id", payload.session.id);
    } catch { /* Session can still run without browser storage. */ }
  }, []);

  useEffect(() => {
    let mounted = true;
    let savedNim: string | null = null, savedToken: string | null = null, sessionId: string | null = null;
    try {
      savedNim = sessionStorage.getItem("exam_nim");
      savedToken = sessionStorage.getItem("exam_token");
      sessionId = sessionStorage.getItem("exam_session_id");
    } catch { /* Cookie-based resume works even when storage is unavailable. */ }
    void sessionId;
    setIsStarting(true);
    restoreRequest.current ??= studentApiRequest<StudentExamPayload & { violations?: number }>("/api/exam/resume", { method: "POST" })
      .catch((error) => {
        if (error instanceof StudentApiError && error.status === 401 && savedNim && savedToken) {
          return studentApiRequest<StudentExamPayload & { violations?: number }>("/api/exam/start", {
            method: "POST", body: JSON.stringify({ nim: savedNim, token: savedToken })
          });
        }
        throw error;
      });
    void restoreRequest.current.then((payload) => { if (mounted) installExam(payload); })
      .catch((error) => { if (mounted && !(error instanceof StudentApiError && error.status === 401 && !savedNim)) setError(error instanceof Error ? error.message : "Sesi belum dapat dilanjutkan. Coba muat ulang."); })
      .finally(() => { if (mounted) setIsStarting(false); });
    return () => { mounted = false; };
  }, [installExam]);

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    answerSync.current?.stop();
  }, []);

  const questions = useMemo(() => examData?.questions ?? [], [examData]);
  const currentQuestion = questions[currentIndex];
  const violationLimit = examData?.exam.violationLimit ?? 5;
  const enabledViolationTypes = useMemo(
    () => normalizeEnabledViolations(examData?.exam.enabledViolationTypes),
    [examData?.exam.enabledViolationTypes]
  );
  const answeredCount = useMemo(
    () => questions.filter((question) => answers[question.id]?.trim()).length,
    [answers, questions]
  );
  const progress =
    questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const isClosed = Boolean(submitted);
  const isPaused = examData?.session.status === "paused";
  const isLastQuestion =
    questions.length > 0 && currentIndex === questions.length - 1;
  const allQuestionsAnswered =
    questions.length > 0 && answeredCount === questions.length;
  const canSubmitManually = isLastQuestion && allQuestionsAnswered;

  const flushDirtyAnswers = useCallback(async () => {
    const sync = answerSync.current;
    if (!sync || sync.isStopped || isClosed || isPaused || submitLock.current || Date.now() < retryAfter.current || !sync.size) return;
    try {
      await sync.flush();
      saveFailures.current = 0;
      retryAfter.current = 0;
      setSaveStatus("Tersimpan di server");
    } catch (error) {
      setSaveStatus("Belum tersinkron — draf disimpan di perangkat");
      if (error instanceof StudentApiError && [401, 409, 422].includes(error.status)) {
        if (!error.message.startsWith("Sesi dijeda")) sync.stop();
        setError(error.message);
      } else {
        saveFailures.current++;
        retryAfter.current = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(saveFailures.current, 5));
      }
    }
  }, [isClosed, isPaused]);

  const submitExam = useCallback(
    async (
      message = "Jawaban berhasil dikirim.",
      options: { allowIncomplete?: boolean } = {}
    ) => {
      if (!examData || submitLock.current || isClosed || isPaused) {
        return;
      }

      if (!options.allowIncomplete) {
        const complete =
          questions.length > 0 &&
          questions.every((question) => answers[question.id]?.trim());
        const onLastQuestion =
          questions.length > 0 && currentIndex === questions.length - 1;

        if (!onLastQuestion || !complete) {
          setError(
            "Submit hanya tersedia di soal terakhir setelah semua jawaban terisi."
          );
          return;
        }
      }

      submitLock.current = true;
      setIsSubmitting(true);
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      setError("");

      try {
        try {
          await answerSync.current?.flush();
        } catch (saveError) {
          if (!options.allowIncomplete) {
            throw saveError;
          }
        }

        const result = await studentApiRequest<SubmitPayload>(
          `/api/exam/sessions/${examData.session.id}/submit`,
          { method: "POST", body: JSON.stringify({
            answers: answerSync.current?.snapshot() ?? [],
            expectedRevision: answerSync.current?.revision ?? examData.session.answerRevision,
            writerId: examData.session.writerId
          }) }
        );
        answerSync.current?.stop();
        if (result?.unsavedAnswers) {
          setNotice("Waktu habis. Jawaban yang telah tersimpan dikirim; draf yang terlambat tersinkron tetap ada di perangkat.");
        } else {
          try { localStorage.removeItem(`exam_draft_${examData.session.id}`); } catch { /* Keep acceptance independent of local storage. */ }
          setNotice(message);
        }
        setSubmitted(result ?? { status: "submitted" });
        setSaveStatus("Sesi selesai");
        try { sessionStorage.removeItem("exam_session_id"); sessionStorage.removeItem("exam_nim"); sessionStorage.removeItem("exam_token"); } catch { /* Server acceptance remains confirmed. */ }
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Jawaban belum bisa dikirim."
        );
      } finally {
        submitLock.current = false;
        setIsSubmitting(false);
      }
    },
    [answers, currentIndex, examData, isClosed, isPaused, questions]
  );

  const recordViolation = useCallback(
    async (type: string, metadata?: Record<string, unknown>) => {
      if (
        !examData ||
        isClosed ||
        isPaused ||
        !enabledViolationTypes.includes(type as ViolationType)
      ) {
        return;
      }

      const now = Date.now();
      const last = violationCooldown.current[type] ?? 0;

      if (now - last < 1500) {
        return;
      }

      violationCooldown.current[type] = now;
      const violationLabel = violationTypeLabel(type, metadata);

      try {
        try { await answerSync.current?.flush(); } catch { /* Keep unsynced draft and still record the violation. */ }
        const result = await studentApiRequest<ViolationPayload>(
          `/api/exam/sessions/${examData.session.id}/violations`,
          {
            body: JSON.stringify({ type, metadata }),
            method: "POST"
          }
        );
        if (result.ignored) {
          return;
        }

        setViolationCount(result.totalViolations);
        setViolationPopup({
          count: result.totalViolations,
          title: result.autoSubmitted
            ? "Ujian otomatis disubmit"
            : "Pelanggaran terdeteksi",
          message: result.autoSubmitted
            ? `Jenis pelanggaran: ${violationLabel}. Batas ${result.violationLimit} pelanggaran tercapai. Sistem mengirim jawaban otomatis.`
            : `Jenis pelanggaran: ${violationLabel}. Pelanggaran ${result.totalViolations}/${result.violationLimit}.`
        });
        setNotice(
          result.autoSubmitted
            ? `${result.violationLimit} pelanggaran terdeteksi: ${violationLabel}. Ujian dikirim otomatis.`
            : `Pelanggaran tercatat: ${violationLabel} (${result.totalViolations}/${result.violationLimit}).`
        );

        if (result.autoSubmitted) {
          answerSync.current?.stop();
          try { sessionStorage.removeItem("exam_session_id"); sessionStorage.removeItem("exam_nim"); sessionStorage.removeItem("exam_token"); } catch { /* Storage optional. */ }
          setSubmitted({ status: "auto_submitted" });
          setSaveStatus("Auto submit");
        }
      } catch {
        setViolationPopup({
          count: violationCount,
          title: "Pelanggaran terdeteksi",
          message: `Jenis pelanggaran: ${violationLabel}. Koneksi pencatatan sedang bermasalah.`
        });
        setNotice(
          `Pelanggaran terdeteksi: ${violationLabel}, tetapi belum bisa dicatat.`
        );
      }
    },
    [enabledViolationTypes, examData, isClosed, isPaused, violationCount]
  );

  useEffect(() => {
    if (!violationPopup) {
      return;
    }

    const timeoutId = window.setTimeout(() => setViolationPopup(null), 8000);

    return () => window.clearTimeout(timeoutId);
  }, [violationPopup]);

  const handleTimeExpired = useCallback(() => {
    void submitExam("Waktu habis. Jawaban dikirim otomatis.", {
      allowIncomplete: true
    });
  }, [submitExam]);

  const sessionId = examData?.session.id;
  useEffect(() => {
    if (!sessionId || isClosed || isPaused) return;
    const flush = () => { void flushDirtyAnswers(); };
    const online = () => { retryAfter.current = 0; flush(); };
    const intervalId = window.setInterval(flush, 5000);
    window.addEventListener("online", online);
    return () => { window.clearInterval(intervalId); window.removeEventListener("online", online); };
  }, [sessionId, flushDirtyAnswers, isClosed, isPaused]);

  useEffect(() => {
    if (!sessionId || isClosed) return;
    let stopped = false, failures = 0, timeoutId: number;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const status = await studentApiRequest<SessionStatusPayload>(`/api/exam/sessions/${sessionId}/status`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])
        });
        if (stopped) return;
        failures = 0;
        if (["paused", "in_progress"].includes(status.status)) {
          setExamData((prev) => prev && (prev.session.status !== status.status || (status.expiresAt && prev.session.expiresAt !== status.expiresAt))
            ? { ...prev, session: { ...prev.session, status: status.status, expiresAt: status.expiresAt ?? prev.session.expiresAt } } : prev);
        } else {
          answerSync.current?.stop();
          setSubmitted({ status: status.status });
          setSaveStatus("Sesi ditutup");
          setNotice("Sesi sudah ditutup. Jawaban tersimpan diterima; draf yang belum tersinkron tetap di perangkat.");
          try { sessionStorage.removeItem("exam_session_id"); sessionStorage.removeItem("exam_nim"); sessionStorage.removeItem("exam_token"); } catch { /* Storage optional. */ }
          return;
        }
      } catch { if (stopped) return; failures++; }
      if (!stopped) timeoutId = window.setTimeout(() => { void poll(); }, Math.min(30000, 5000 * 2 ** Math.min(failures, 3)) + Math.random() * 500);
    };
    timeoutId = window.setTimeout(() => { void poll(); }, 5000 + Math.random() * 500);
    return () => { stopped = true; controller.abort(); window.clearTimeout(timeoutId); };
  }, [sessionId, isClosed]);

  useEffect(() => {
    if (!examData || isClosed) {
      return;
    }

    const shouldDetect = (type: string) =>
      enabledViolationTypes.includes(type as ViolationType);
    const blockAndReport = (event: Event, type: string) => {
      if (!shouldDetect(type)) {
        return;
      }

      event.preventDefault();
      void recordViolation(type);
    };
    const handleContextMenu = (event: MouseEvent) =>
      blockAndReport(event, "context-menu");
    const handleCopy = (event: ClipboardEvent) => blockAndReport(event, "copy");
    const handleCut = (event: ClipboardEvent) => blockAndReport(event, "cut");
    const handlePaste = (event: ClipboardEvent) => blockAndReport(event, "paste");
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blocked =
        (event.ctrlKey || event.metaKey) &&
        ["a", "c", "p", "s", "u", "v", "x"].includes(key);

      if (blocked && shouldDetect("keyboard-shortcut")) {
        event.preventDefault();
        void recordViolation("keyboard-shortcut", { key });
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (shouldDetect("app-switch")) {
          void recordViolation("app-switch", { trigger: "visibility-hidden" });
        }
      }
    };
    const handleBlur = () => {
      if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;
      if (shouldDetect("app-switch")) {
        void recordViolation("app-switch", { trigger: "window-blur" });
      }
    };
    const handlePageHide = () => {
      if (shouldDetect("app-switch")) {
        void recordViolation("app-switch", { trigger: "page-hide" });
      }
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [enabledViolationTypes, examData, isClosed, recordViolation]);

  const startExam = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsStarting(true);

    try {
      const payload = await studentApiRequest<StudentExamPayload & { violations?: number }>("/api/exam/start", {
        body: JSON.stringify({ nim: nim.trim(), token: token.trim() }),
        method: "POST"
      });

      installExam(payload);

      try { sessionStorage.setItem("exam_nim", nim.trim()); sessionStorage.setItem("exam_token", token.trim()); } catch { /* Cookie credentials still authorize this session. */ }
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "NIM atau token belum bisa diverifikasi."
      );
    } finally {
      setIsStarting(false);
    }
  };

  const updateAnswer = (questionId: string, value: string) => {
    if (isPaused || isClosed || submitLock.current) return;
    setAnswers((current) => ({ ...current, [questionId]: value }));
    answerSync.current?.update(questionId, value);
    setSaveStatus("Perubahan belum tersimpan");
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushDirtyAnswers(); }, 700);
  };

  const goToQuestion = (index: number) => {
    if (index < 0 || index >= questions.length || index === currentIndex || isSubmitting || isPaused) return;
    setSlideDirection(index > currentIndex ? "forward" : "backward");
    setCurrentIndex(index);
    void flushDirtyAnswers();
  };

  const downloadDraft = () => {
    if (!examData) return;
    const pending = answerSync.current?.snapshot() ?? [];
    const draft = pending.length ? pending : reviewDraft;
    const lines = draft.map((row) => `Soal ${questions.findIndex((question) => question.id === row.questionId) + 1}\n${row.answer}`);
    const blob = new Blob([`${examData.exam.name} — ${examData.participant.nim}\nJawaban belum tersinkron\n\n${lines.join("\n\n")}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "salinan-jawaban.txt"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const questionVariants: Variants = {
    enter: (direction: "forward" | "backward") => ({
      x: reducedMotion ? 0 : direction === "forward" ? 40 : -40,
      opacity: reducedMotion ? 1 : 0
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: {
        x: { type: "tween", ease: "easeOut", duration: reducedMotion ? 0 : 0.2 },
        opacity: { duration: reducedMotion ? 0 : 0.18 }
      }
    },
    exit: (direction: "forward" | "backward") => ({
      x: reducedMotion ? 0 : direction === "forward" ? -40 : 40,
      opacity: 0,
      transition: {
        x: { type: "tween", ease: "easeIn", duration: reducedMotion ? 0 : 0.15 },
        opacity: { duration: reducedMotion ? 0 : 0.12 }
      }
    })
  };

  return (
    <AnimatePresence mode="wait">
      {!examData ? (
        <motion.main
          key="login"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.25 }}
          className="min-h-screen playful-bg px-4 py-8 text-slate-950"
        >
          <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="clay-hero p-8 text-white md:p-10 flex flex-col justify-between min-h-[460px]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-bold backdrop-blur-sm">
                  <ShieldAlert className="h-4 w-4" />
                  Akses Mahasiswa
                </div>
                <h1 className="mt-6 max-w-2xl text-4xl font-extrabold md:text-5xl">
                  Masuk Ujian dengan NIM dan Token
                </h1>
                <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-white/90">
                  Tidak perlu akun mahasiswa. Pastikan NIM sudah terdaftar pada paket
                  ujian dan token masih berada dalam jadwal aktif.
                </p>
              </div>
              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                {[
                  ["Autosave", "Setiap 5 detik"],
                  ["Anti kecurangan", `${violationLimit} pelanggaran auto submit`]
                ].map(([label, value]) => (
                  <div
                    className="rounded-3xl bg-white/14 p-4 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.24),inset_-3px_-3px_7px_rgba(15,23,42,0.14)]"
                    key={label}
                  >
                    <p className="text-sm font-medium text-white/80">{label}</p>
                    <p className="mt-1 text-sm font-bold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-3xl bg-teal-950/30 border border-white/10 p-5 space-y-3 shadow-md backdrop-blur-md">
                <p className="font-black uppercase tracking-wider text-yellow-300 text-sm flex items-center gap-1.5">
                  <span>⚠️</span> Jenis Pelanggaran Terdeteksi:
                </p>
                <ul className="grid gap-2 text-white font-bold text-sm sm:grid-cols-2 list-disc pl-4">
                  <li>Berpindah tab atau aplikasi</li>
                  <li>Membuka klik kanan</li>
                  <li>Menyalin teks (Copy)</li>
                  <li>Memotong teks (Cut)</li>
                  <li>Menempel teks (Paste)</li>
                  <li>Shortcut keyboard terlarang</li>
                </ul>
                <p className="text-xs text-yellow-200/95 font-extrabold pt-1 leading-relaxed">
                  Ujian akan langsung disubmit otomatis jika batas maksimal pelanggaran tercapai.
                </p>
              </div>
            </section>

            <Card>
              <CardHeader>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl clay-btn-success text-white">
                  <LockKeyhole className="h-6 w-6" />
                </div>
                <CardTitle>Login Ujian</CardTitle>
                <CardDescription>
                  Masukkan NIM dan token paket ujian dari dosen/admin.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={startExam}>
                  {error && (
                    <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.7),inset_-2px_-2px_5px_rgba(190,24,74,0.12)]">
                      {error}
                    </div>
                  )}
                  <label className="space-y-2 text-sm font-bold">
                    NIM
                    <Input
                      autoComplete="username"
                      placeholder="Contoh: 23103001"
                      value={nim}
                      onChange={(event) => setNim(event.target.value)}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-bold">
                    Token Ujian
                    <Input
                      autoComplete="one-time-code"
                      maxLength={4}
                      placeholder="Contoh: ABCD"
                      value={token}
                      onChange={(event) =>
                        setToken(
                          event.target.value
                            .replace(/[^a-z]/gi, "")
                            .toUpperCase()
                            .slice(0, 4)
                        )
                      }
                    />
                  </label>
                  <Button
                    className="h-12 w-full"
                    disabled={isStarting}
                    type="submit"
                  >
                    <BookOpenCheck />
                    {isStarting ? "Memverifikasi..." : "Masuk dan Mulai"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </motion.main>
      ) : isClosed ? (
        <motion.main
          key="closed"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25 }}
          className="flex min-h-screen items-center justify-center playful-bg px-4 text-slate-950"
        >
          <Card className="w-full max-w-xl">
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl clay-btn-success text-white">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <CardTitle>Ujian Selesai</CardTitle>
              <CardDescription>{notice || "Jawaban sudah dikirim."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="clay-soft-panel p-3 lg:p-4">
                  <p className="text-sm font-bold text-slate-500">Mahasiswa</p>
                  <p className="mt-1 font-black">{examData.participant.name}</p>
                  <p className="text-sm text-slate-500">{examData.participant.nim}</p>
                </div>
                <div className="clay-soft-panel p-3 lg:p-4">
                  <p className="text-sm font-bold text-slate-500">Status</p>
                  <p className="mt-1 font-black capitalize">
                    {submitted?.status?.replace("_", " ") ?? "submitted"}
                  </p>
                  <p className="text-sm text-slate-500">Jawaban telah dikirim.</p>
                </div>
              </div>
              {Boolean(answerSync.current?.size || reviewDraft.length) && (
                <Button className="w-full" variant="outline" onClick={downloadDraft}>Simpan salinan jawaban belum tersinkron</Button>
              )}
              <Button className="w-full" onClick={() => {
                void studentApiRequest("/api/exam/logout", { method: "POST" }).then(() => {
                  try { sessionStorage.removeItem("exam_session_id"); sessionStorage.removeItem("exam_nim"); sessionStorage.removeItem("exam_token"); } catch { /* Storage optional. */ }
                  window.location.reload();
                }).catch(() => setNotice("Belum dapat kembali ke login. Periksa koneksi dan coba lagi."));
              }}>
                Kembali ke Login
              </Button>
            </CardContent>
          </Card>
        </motion.main>
      ) : examData && isPaused ? (
        <motion.main
          key="paused"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25 }}
          className="flex min-h-screen items-center justify-center playful-bg px-4 text-slate-950"
        >
          <Card className="w-full max-w-xl text-center p-6 flex flex-col items-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-md animate-pulse">
              <Pause className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-extrabold text-slate-900">Ujian Ditangguhkan (Paused)</CardTitle>
              <p className="text-sm font-semibold leading-relaxed text-slate-500">
                Ujian Anda sedang ditangguhkan sementara oleh pengawas/dosen.
                Seluruh aktivitas pengisian jawaban dinonaktifkan.
              </p>
              <p className="text-xs font-bold text-amber-700 bg-amber-50 rounded-xl px-4 py-2 mt-3 inline-block">
                Silakan menunggu pengawas mengaktifkan kembali ujian Anda. Jangan menutup halaman ini.
              </p>
            </div>
          </Card>
        </motion.main>
      ) : (
        <motion.main
          key="exam"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="min-h-screen playful-bg px-4 py-3 text-slate-950 lg:py-6"
        >
      <AnimatePresence>
        {showSubmitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center space-y-5"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-2px_-2px_5px_rgba(245,158,11,0.1)]">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-extrabold text-slate-900">Konfirmasi Kirim Ujian</h3>
                <p className="text-sm leading-6 text-slate-500 font-semibold">
                  Apakah Anda yakin ingin menyelesaikan ujian dan mengirim semua jawaban sekarang? Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 w-full">
                <Button
                  variant="outline"
                  className="h-12 rounded-2xl font-bold"
                  onClick={() => setShowSubmitConfirm(false)}
                >
                  Batal
                </Button>
                <Button
                  className="h-12 rounded-2xl font-bold clay-btn-success"
                  onClick={() => {
                    setShowSubmitConfirm(false);
                    void submitExam();
                  }}
                >
                  Ya, Kirim
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {violationPopup && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, x: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 20, stiffness: 260 }}
            className="fixed right-4 top-4 z-50 w-[calc(100vw-2rem)] max-w-md rounded-3xl border border-rose-200 bg-rose-50 p-4 text-rose-950 shadow-[8px_14px_30px_rgba(190,18,60,0.18),inset_1px_1px_2px_rgba(255,255,255,0.8)]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-2px_-2px_5px_rgba(190,18,60,0.12)]">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="w-full">
                <p className="text-sm font-black">{violationPopup.title}</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-rose-900/80">
                  {violationPopup.message}
                </p>
                <div className="mt-3 h-2 rounded-full bg-rose-100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.min(
                        100,
                        Math.max(0, (violationPopup.count / violationLimit) * 100)
                      )}%`
                    }}
                    transition={{ type: "spring", damping: 20, stiffness: 100 }}
                    className="h-2 rounded-full bg-rose-500"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mx-auto grid max-w-7xl gap-3 lg:gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="clay-sidebar p-3 lg:p-5 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <div className="clay-brand hidden items-center gap-3 rounded-3xl p-3.5 lg:flex">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl clay-btn-success text-white">
              <BookOpenCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-emerald-950">
                {examData.exam.name}
              </p>
              <p className="text-xs font-semibold text-emerald-700/80">
                {examData.participant.name}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:mt-5 lg:grid-cols-1 lg:gap-3">
            <div className="clay-soft-panel p-3 lg:p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-500">Sisa Waktu</p>
                <Clock3 className="h-4 w-4 text-sky-700" />
              </div>
              <ExamCountdown
                expiresAt={examData.session.expiresAt}
                isPaused={isPaused || isClosed}
                onExpire={handleTimeExpired}
              />
            </div>
            <div className="clay-soft-panel p-3 lg:p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-500">Progress</p>
                <p className="text-sm font-black text-sky-700">{progress}%</p>
              </div>
              <Progress value={progress} />
              <p className="mt-2 text-xs font-semibold text-slate-500">
                {answeredCount}/{questions.length} soal terjawab
              </p>
            </div>
            <div className="col-span-2 rounded-2xl bg-amber-50 px-3 py-2 lg:col-span-1 lg:p-4 text-amber-950 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.72),inset_-2px_-2px_5px_rgba(180,83,9,0.13)]">
              <div className="flex items-center gap-2 text-sm font-black">
                <AlertTriangle className="h-4 w-4" />
                Pelanggaran {violationCount}/{violationLimit}
              </div>
              <p className="mt-2 hidden text-xs font-semibold leading-5 lg:block">
                Copy, paste, klik kanan, shortcut umum, dan pindah tab dipantau.
              </p>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:mt-5 lg:grid lg:grid-cols-5 lg:overflow-x-visible">
            {questions.map((question, index) => {
              const answered = Boolean(answers[question.id]?.trim());
              const active = index === currentIndex;

              return (
                <button
                  className={cn(
                    "h-11 min-w-11 shrink-0 rounded-2xl text-sm font-black transition-all active:scale-95",
                    active
                      ? "clay-btn-primary"
                      : answered
                        ? "bg-emerald-100 text-emerald-800 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.7),inset_-2px_-2px_5px_rgba(4,120,87,0.14)]"
                        : "clay-btn-outline"
                  )}
                  key={question.id}
                  type="button"
                  onClick={() => void goToQuestion(index)}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-5">
          <header className="clay-header rounded-[28px] px-5 py-4 md:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  Ujian Mahasiswa
                </p>
                <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">
                  {examData.exam.name}
                </h1>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {examData.exam.description || "Kerjakan soal dengan teliti."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">
                  <Save className="mr-1 h-3 w-3" />
                  {saveStatus}
                </Badge>
                {reviewDraft.length > 0 && <Button size="sm" variant="outline" onClick={downloadDraft}>Simpan salinan draf lama</Button>}
                <Badge variant="warning">
                  <ShieldAlert className="mr-1 h-3 w-3" />
                  Anti kecurangan aktif
                </Badge>
              </div>
            </div>
          </header>

          {notice && (
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-bold text-sky-800 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.72),inset_-2px_-2px_5px_rgba(3,105,161,0.12)]">
              {notice}
            </div>
          )}
          {error && (
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.72),inset_-2px_-2px_5px_rgba(190,24,74,0.12)]">
              {error}
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>
                  Soal {currentIndex + 1} dari {questions.length}
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  {currentQuestion ? (
                    <>
                      <span>{questionTypeLabel(currentQuestion.type)}</span>
                      <span>•</span>
                      <span className="font-semibold text-primary">{currentQuestion.score ?? 1} Poin</span>
                    </>
                  ) : (
                    "Tidak ada soal pada paket ini."
                  )}
                </CardDescription>
              </div>
              <Badge variant="secondary">
                <ListChecks className="mr-1 h-3 w-3" />
                {answeredCount} terjawab
              </Badge>
            </CardHeader>
            <CardContent className="space-y-5 overflow-hidden">
              <AnimatePresence mode="wait" custom={slideDirection}>
                <motion.div
                  key={currentIndex}
                  custom={slideDirection}
                  variants={questionVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="space-y-5"
                  style={{ willChange: "transform, opacity" }}
                >
                  {currentQuestion ? (
                    <>
                      <div className="rounded-3xl bg-white/70 p-5 text-lg font-bold leading-8 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.78),inset_-3px_-3px_8px_rgba(148,163,184,0.08)]">
                        <MathContent text={currentQuestion.prompt} />
                        {currentQuestion.imageUrl && (
                          <div className="relative mt-4 aspect-video overflow-hidden rounded-2xl bg-slate-100">
                            <Image
                              fill
                              unoptimized
                              alt={`Gambar soal ${currentIndex + 1}`}
                              className="object-contain"
                              src={currentQuestion.imageUrl}
                            />
                          </div>
                        )}
                      </div>

                      {currentQuestion.type === "multiple_choice" && (
                        <div className="grid gap-3">
                          {(currentQuestion.options ?? []).map((option, index) => {
                            const selected = answers[currentQuestion.id] === option.id;

                            return (
                              <button
                                className={cn(
                                  "flex items-start gap-3 rounded-3xl px-4 py-4 text-left font-bold transition-all active:scale-[0.99]",
                                  selected
                                    ? "clay-btn-selected"
                                    : "clay-btn-outline"
                                )}
                                key={option.id}
                                type="button"
                                onClick={() => updateAnswer(currentQuestion.id, option.id)}
                              >
                                <span className={cn(
                                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black transition-all",
                                  selected
                                    ? "bg-sky-600 text-white shadow-sm scale-105"
                                    : "bg-white/70 text-slate-700"
                                )}>
                                  {String.fromCharCode(65 + index)}
                                </span>
                                <span className="min-w-0 flex-1 space-y-3">
                                  {option.imageUrl && (
                                    <span className="relative block aspect-video max-w-xl overflow-hidden rounded-2xl bg-white/70">
                                      <Image
                                        fill
                                        unoptimized
                                        alt={`Gambar pilihan ${String.fromCharCode(65 + index)}`}
                                        className="object-contain"
                                        src={option.imageUrl}
                                      />
                                    </span>
                                  )}
                                  {option.text && (
                                    <MathContent className="block" text={option.text} />
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {currentQuestion.type === "short_answer" && (
                        <div className="space-y-2">
                          <label
                            className="block text-sm font-bold text-slate-700"
                            htmlFor={`short-answer-${currentQuestion.id}`}
                          >
                            Jawaban singkat
                          </label>
                          <Input
                            className="text-base"
                            type="text"
                            inputMode="text"
                            autoComplete="off"
                            disabled={isSubmitting || isPaused}
                            maxLength={50000}
                            id={`short-answer-${currentQuestion.id}`}
                            placeholder="Tulis jawaban singkat"
                            value={answers[currentQuestion.id] ?? ""}
                            onChange={(event) => updateAnswer(currentQuestion.id, event.target.value)}
                          />
                          {currentQuestion.answerFormat === "math" && (
                            <p className="text-xs font-semibold leading-5 text-slate-500">
                              Tulis seperti 1/2, x^2, atau sqrt(9) menggunakan keyboard biasa.
                            </p>
                          )}
                        </div>
                      )}

                      {currentQuestion.type === "essay" && (
                        <Textarea
                          aria-label={`Jawaban esai soal ${currentIndex + 1}`}
                          disabled={isSubmitting || isPaused}
                          maxLength={50000}
                          className="min-h-[220px] text-base leading-7"
                          placeholder="Tulis jawaban esai"
                          value={answers[currentQuestion.id] ?? ""}
                          onChange={(event) =>
                            updateAnswer(currentQuestion.id, event.target.value)
                          }
                        />
                      )}
                    </>
                  ) : (
                    <div className="rounded-3xl bg-amber-50 p-6 font-bold text-amber-900">
                      Paket ini belum memiliki soal. Hubungi dosen/admin.
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="flex flex-col gap-3 border-t border-slate-200/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  <Button
                    disabled={currentIndex === 0}
                    type="button"
                    variant="outline"
                    onClick={() => void goToQuestion(currentIndex - 1)}
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    disabled={currentIndex >= questions.length - 1}
                    type="button"
                    variant="outline"
                    onClick={() => void goToQuestion(currentIndex + 1)}
                  >
                    Berikutnya
                  </Button>
                </div>
                {canSubmitManually && (
                  <Button
                    disabled={isSubmitting}
                    type="button"
                    onClick={() => setShowSubmitConfirm(true)}
                  >
                    <Send />
                    {isSubmitting ? "Mengirim..." : "Submit Ujian"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
        </div>
      </motion.main>
    )}
  </AnimatePresence>
  );
}
