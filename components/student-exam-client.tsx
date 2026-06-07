"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  ListChecks,
  LockKeyhole,
  Save,
  Send,
  ShieldAlert
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
};

type StudentQuestion = {
  id: string;
  options: { id: string; text: string }[] | null;
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
  };
};

type ViolationPayload = {
  autoSubmitted: boolean;
  totalViolations: number;
  violationLimit: number;
};

type SubmitPayload = {
  score?: number;
  status?: string;
};

type SessionStatusPayload = {
  id: string;
  status: string;
  submittedAt: string | null;
};

type StudentExamClientProps = {
  initialToken: string;
};

async function studentApiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!response.ok) {
    throw new Error(payload.error ?? "Request gagal.");
  }

  return payload.data as T;
}

function formatRemaining(ms: number) {
  const safeMs = Math.max(ms, 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Belum ada sesi aktif");
  const [remainingMs, setRemainingMs] = useState(0);
  const [submitted, setSubmitted] = useState<SubmitPayload | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [violationPopup, setViolationPopup] = useState<{
    count: number;
    message: string;
    title: string;
  } | null>(null);
  const dirtyQuestionIds = useRef(new Set<string>());
  const saveTimers = useRef<Record<string, number>>({});
  const violationCooldown = useRef<Record<string, number>>({});

  const questions = useMemo(() => examData?.questions ?? [], [examData]);
  const currentQuestion = questions[currentIndex];
  const violationLimit = examData?.exam.violationLimit ?? 5;
  const answeredCount = useMemo(
    () => questions.filter((question) => answers[question.id]?.trim()).length,
    [answers, questions]
  );
  const progress =
    questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const isClosed = Boolean(submitted);
  const isLastQuestion =
    questions.length > 0 && currentIndex === questions.length - 1;
  const allQuestionsAnswered =
    questions.length > 0 && answeredCount === questions.length;
  const canSubmitManually = isLastQuestion && allQuestionsAnswered;

  const saveAnswer = useCallback(
    async (questionId: string, value: string) => {
      if (!examData || isClosed) {
        return;
      }

      setSaveStatus("Menyimpan...");
      await studentApiRequest(`/api/exam/sessions/${examData.session.id}/answers`, {
        body: JSON.stringify({ questionId, answer: value }),
        method: "PATCH"
      });
      dirtyQuestionIds.current.delete(questionId);
      setSaveStatus(`Tersimpan ${new Date().toLocaleTimeString("id-ID")}`);
    },
    [examData, isClosed]
  );

  const flushDirtyAnswers = useCallback(async () => {
    if (!examData || isClosed || dirtyQuestionIds.current.size === 0) {
      return;
    }

    const queue = Array.from(dirtyQuestionIds.current);
    await Promise.all(
      queue.map((questionId) => saveAnswer(questionId, answers[questionId] ?? ""))
    );
  }, [answers, examData, isClosed, saveAnswer]);

  const submitExam = useCallback(
    async (
      message = "Jawaban berhasil dikirim.",
      options: { allowIncomplete?: boolean } = {}
    ) => {
      if (!examData || isSubmitting || isClosed) {
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

      setIsSubmitting(true);
      setError("");

      try {
        try {
          await flushDirtyAnswers();
        } catch (saveError) {
          if (!options.allowIncomplete) {
            throw saveError;
          }
        }

        const result = await studentApiRequest<SubmitPayload>(
          `/api/exam/sessions/${examData.session.id}/submit`,
          { method: "POST" }
        );
        setSubmitted(result ?? { status: "submitted" });
        setNotice(message);
        setSaveStatus("Sesi selesai");
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Jawaban belum bisa dikirim."
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [answers, currentIndex, examData, flushDirtyAnswers, isClosed, isSubmitting, questions]
  );

  const recordViolation = useCallback(
    async (type: string, metadata?: Record<string, unknown>) => {
      if (!examData || isClosed) {
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
        const result = await studentApiRequest<ViolationPayload>(
          `/api/exam/sessions/${examData.session.id}/violations`,
          {
            body: JSON.stringify({ type, metadata }),
            method: "POST"
          }
        );
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
    [examData, isClosed, violationCount]
  );

  useEffect(() => {
    if (!violationPopup) {
      return;
    }

    const timeoutId = window.setTimeout(() => setViolationPopup(null), 8000);

    return () => window.clearTimeout(timeoutId);
  }, [violationPopup]);

  useEffect(() => {
    if (!examData || isClosed) {
      return;
    }

    const tick = () => {
      const expiresAt = new Date(examData.session.expiresAt).getTime();
      const nextRemaining = expiresAt - Date.now();

      setRemainingMs(Math.max(nextRemaining, 0));

      if (nextRemaining <= 0) {
        void submitExam("Waktu habis. Jawaban dikirim otomatis.", {
          allowIncomplete: true
        });
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);

    return () => window.clearInterval(intervalId);
  }, [examData, isClosed, submitExam]);

  useEffect(() => {
    if (!examData || isClosed) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void flushDirtyAnswers();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [examData, flushDirtyAnswers, isClosed]);

  useEffect(() => {
    if (!examData || isClosed) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const status = await studentApiRequest<SessionStatusPayload>(
          `/api/exam/sessions/${examData.session.id}/status`
        );

        if (status.status !== "in_progress") {
          setSubmitted({ status: status.status });
          setSaveStatus("Sesi ditutup");
          setNotice(
            status.status === "auto_submitted"
              ? "Ujian dihentikan oleh pengawas. Jawaban tersimpan sudah dikirim."
              : "Sesi ujian sudah ditutup."
          );
        }
      } catch {
        // Polling status tidak mengganggu pengerjaan jika koneksi sesaat gagal.
      }
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [examData, isClosed]);

  useEffect(() => {
    if (!examData || isClosed) {
      return;
    }

    const blockAndReport = (event: Event, type: string) => {
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

      if (blocked) {
        event.preventDefault();
        void recordViolation("keyboard-shortcut", { key });
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        void recordViolation("app-switch", { trigger: "visibility-hidden" });
      }
    };
    const handleBlur = () => {
      void recordViolation("app-switch", { trigger: "window-blur" });
    };
    const handlePageHide = () => {
      void recordViolation("app-switch", { trigger: "page-hide" });
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
  }, [examData, isClosed, recordViolation]);

  const startExam = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsStarting(true);

    try {
      const payload = await studentApiRequest<StudentExamPayload>("/api/exam/start", {
        body: JSON.stringify({ nim: nim.trim(), token: token.trim() }),
        method: "POST"
      });

      setExamData(payload);
      setAnswers(payload.answers ?? {});
      setCurrentIndex(0);
      setSubmitted(null);
      setViolationCount(0);
      setSaveStatus("Sesi aktif");
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
    setAnswers((current) => ({ ...current, [questionId]: value }));
    dirtyQuestionIds.current.add(questionId);
    setSaveStatus("Perubahan belum tersimpan");

    window.clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = window.setTimeout(() => {
      void saveAnswer(questionId, value);
    }, 700);
  };

  const goToQuestion = async (index: number) => {
    if (index < 0 || index >= questions.length || index === currentIndex) {
      return;
    }

    if (currentQuestion && dirtyQuestionIds.current.has(currentQuestion.id)) {
      await saveAnswer(currentQuestion.id, answers[currentQuestion.id] ?? "");
    }

    setCurrentIndex(index);
  };

  if (!examData) {
    return (
      <main className="min-h-screen playful-bg px-4 py-8 text-slate-950">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="clay-hero p-8 text-white md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-bold backdrop-blur-sm">
              <ShieldAlert className="h-4 w-4" />
              Akses Mahasiswa
            </div>
            <h1 className="mt-8 max-w-2xl text-4xl font-extrabold md:text-5xl">
              Masuk Ujian dengan NIM dan Token
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-white/90">
              Tidak perlu akun mahasiswa. Pastikan NIM sudah terdaftar pada paket
              ujian dan token masih berada dalam jadwal aktif.
            </p>
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
      </main>
    );
  }

  if (isClosed) {
    return (
      <main className="flex min-h-screen items-center justify-center playful-bg px-4 text-slate-950">
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
              <div className="clay-soft-panel p-4">
                <p className="text-sm font-bold text-slate-500">Mahasiswa</p>
                <p className="mt-1 font-black">{examData.participant.name}</p>
                <p className="text-sm text-slate-500">{examData.participant.nim}</p>
              </div>
              <div className="clay-soft-panel p-4">
                <p className="text-sm font-bold text-slate-500">Status</p>
                <p className="mt-1 font-black capitalize">
                  {submitted?.status?.replace("_", " ") ?? "submitted"}
                </p>
                <p className="text-sm text-slate-500">Jawaban telah dikirim.</p>
              </div>
            </div>
            <Button className="w-full" onClick={() => window.location.reload()}>
              Kembali ke Login
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen playful-bg px-4 py-6 text-slate-950">
      {violationPopup && (
        <div className="fixed right-4 top-4 z-50 w-[calc(100vw-2rem)] max-w-md rounded-3xl border border-rose-200 bg-rose-50 p-4 text-rose-950 shadow-[8px_14px_30px_rgba(190,18,60,0.18),inset_1px_1px_2px_rgba(255,255,255,0.8)]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-2px_-2px_5px_rgba(190,18,60,0.12)]">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black">{violationPopup.title}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-rose-900/80">
                {violationPopup.message}
              </p>
              <div className="mt-3 h-2 rounded-full bg-rose-100">
                <div
                  className="h-2 rounded-full bg-rose-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, (violationPopup.count / violationLimit) * 100)
                    )}%`
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="clay-sidebar p-5 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <div className="clay-brand flex items-center gap-3 rounded-3xl p-3.5">
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

          <div className="mt-5 grid gap-3">
            <div className="clay-soft-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-500">Sisa Waktu</p>
                <Clock3 className="h-4 w-4 text-sky-700" />
              </div>
              <p className="mt-2 font-mono text-3xl font-black">
                {formatRemaining(remainingMs)}
              </p>
            </div>
            <div className="clay-soft-panel p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-500">Progress</p>
                <p className="text-sm font-black text-sky-700">{progress}%</p>
              </div>
              <Progress value={progress} />
              <p className="mt-2 text-xs font-semibold text-slate-500">
                {answeredCount}/{questions.length} soal terjawab
              </p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 text-amber-950 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.72),inset_-2px_-2px_5px_rgba(180,83,9,0.13)]">
              <div className="flex items-center gap-2 text-sm font-black">
                <AlertTriangle className="h-4 w-4" />
                Pelanggaran {violationCount}/{violationLimit}
              </div>
              <p className="mt-2 text-xs font-semibold leading-5">
                Copy, paste, klik kanan, shortcut umum, dan pindah tab dipantau.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-5 gap-2">
            {questions.map((question, index) => {
              const answered = Boolean(answers[question.id]?.trim());
              const active = index === currentIndex;

              return (
                <button
                  className={cn(
                    "h-11 rounded-2xl text-sm font-black transition-all active:scale-95",
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
                <CardDescription>
                  {currentQuestion
                    ? questionTypeLabel(currentQuestion.type)
                    : "Tidak ada soal pada paket ini."}
                </CardDescription>
              </div>
              <Badge variant="secondary">
                <ListChecks className="mr-1 h-3 w-3" />
                {answeredCount} terjawab
              </Badge>
            </CardHeader>
            <CardContent className="space-y-5">
              {currentQuestion ? (
                <>
                  <div className="rounded-3xl bg-white/70 p-5 text-lg font-bold leading-8 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.78),inset_-3px_-3px_8px_rgba(148,163,184,0.08)]">
                    {currentQuestion.prompt}
                  </div>

                  {currentQuestion.type === "multiple_choice" && (
                    <div className="grid gap-3">
                      {(currentQuestion.options ?? []).map((option, index) => {
                        const selected = answers[currentQuestion.id] === option.id;

                        return (
                          <button
                            className={cn(
                              "flex items-start gap-3 rounded-3xl px-4 py-4 text-left font-semibold transition-all active:scale-[0.99]",
                              selected
                                ? "bg-sky-100 text-sky-900 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.72),inset_-3px_-3px_8px_rgba(3,105,161,0.16),6px_10px_18px_rgba(14,165,233,0.14)]"
                                : "clay-btn-outline"
                            )}
                            key={option.id}
                            type="button"
                            onClick={() => updateAnswer(currentQuestion.id, option.id)}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/70 text-sm font-black">
                              {String.fromCharCode(65 + index)}
                            </span>
                            <span>{option.text}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {currentQuestion.type === "short_answer" && (
                    <Input
                      placeholder="Tulis jawaban singkat"
                      value={answers[currentQuestion.id] ?? ""}
                      onChange={(event) =>
                        updateAnswer(currentQuestion.id, event.target.value)
                      }
                    />
                  )}

                  {currentQuestion.type === "essay" && (
                    <Textarea
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
                    onClick={() => void submitExam()}
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
    </main>
  );
}
