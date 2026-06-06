"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Gauge,
  Link2,
  LayoutDashboard,
  ListChecks,
  MoreHorizontal,
  PenLine,
  Plus,
  PlayCircle,
  RefreshCcw,
  Search,
  Settings2,
  ShieldAlert,
  Shuffle,
  TimerReset,
  Trash2,
  Upload,
  UserCheck,
  UsersRound
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export type View =
  | "dashboard"
  | "exams"
  | "participants"
  | "grading"
  | "analytics";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "exams", label: "Paket Ujian", icon: BookOpenCheck },
  { id: "participants", label: "Peserta", icon: UsersRound },
  { id: "grading", label: "Penilaian", icon: PenLine },
  { id: "analytics", label: "Analitik", icon: BarChart3 }
] satisfies { id: View; label: string; icon: typeof LayoutDashboard }[];

type UserRole = "admin" | "dosen";

type AppUser = {
  id: string;
  name: string;
  role: UserRole;
  title: string;
};

type ExamCard = {
  autoSaveSeconds?: number;
  createdById: string;
  createdByName: string;
  description: string;
  duration: string;
  id: string;
  loggedIn: number;
  name: string;
  participants: number;
  questionMix: {
    essay: number;
    multipleChoice: number;
    shortAnswer: number;
  };
  questions: number;
  shuffleOptions?: boolean;
  shuffleQuestions?: boolean;
  status: "Aktif" | "Draft" | "Selesai" | "Terjadwal";
  submitted: number;
  token: string;
  violationLimit?: number;
  window: string;
};

type QuestionType = "Pilihan Ganda" | "Isian Singkat" | "Esai";

type DraftOption = {
  id: string;
  text: string;
};

type DraftQuestion = {
  answerKey: string;
  correctOptionId: string;
  id: string;
  options: DraftOption[];
  prompt: string;
  score: string;
  type: QuestionType;
};

type ParticipantRow = {
  id: string;
  kelas: string;
  name: string;
  nim: string;
  prodi: string;
  score: number | null;
  status: string;
  violations: number;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
};

type ApiExam = {
  createdAt: string;
  createdById: string | null;
  createdByName?: string | null;
  description: string | null;
  durationMinutes: number;
  endAt: string;
  id: string;
  loggedIn?: number;
  name: string;
  participants?: number;
  questionMix?: {
    essay: number;
    multipleChoice: number;
    shortAnswer: number;
  };
  questions?: number;
  shuffleOptions: boolean;
  shuffleQuestions: boolean;
  startAt: string;
  status: "draft" | "scheduled" | "active" | "finished";
  submitted?: number;
  token: string;
  updatedAt: string;
};

type ApiParticipant = {
  className: string;
  id: string;
  name: string;
  nim: string;
  prodi: string;
  score?: number | null;
  status?: string;
  violations?: number;
};

type DashboardData = {
  activeExams: number;
  liveSessions: LiveSession[];
  scoreBands: ScoreBand[];
  scoreSummary: {
    average: number;
    highest: number;
    lowest: number;
    median: number;
  };
  totalExams: number;
  totalParticipants: number;
  totalViolations: number;
};

type LiveSession = {
  answered: string;
  loginAt: string;
  name: string;
  nim: string;
  progress: number;
  remaining: string;
  status: string;
};

type ScoreBand = {
  color: string;
  range: string;
  value: number;
};

type SessionUser = {
  email?: string | null;
  id: string;
  name?: string | null;
  role?: string | null;
};

const examStatusFromApi: Record<ApiExam["status"], ExamCard["status"]> = {
  active: "Aktif",
  draft: "Draft",
  finished: "Selesai",
  scheduled: "Terjadwal"
};

const examStatusToApi: Record<string, ApiExam["status"]> = {
  Aktif: "active",
  Draft: "draft",
  Selesai: "finished",
  Terjadwal: "scheduled"
};

function normalizeRole(role?: string | null): UserRole {
  return role === "admin" ? "admin" : "dosen";
}

function formatExamWindow(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Jadwal belum valid";
  }

  const date = start.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short"
  });
  const startTime = start.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });
  const endTime = end.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${date}, ${startTime}-${endTime}`;
}

function mapApiExamToCard(exam: ApiExam, currentUser?: AppUser): ExamCard {
  return {
    id: exam.id,
    name: exam.name,
    token: exam.token,
    window: formatExamWindow(exam.startAt, exam.endAt),
    duration: `${exam.durationMinutes} menit`,
    participants: exam.participants ?? 0,
    submitted: exam.submitted ?? 0,
    status: examStatusFromApi[exam.status],
    questions: exam.questions ?? 0,
    loggedIn: exam.loggedIn ?? 0,
    createdById: exam.createdById ?? "",
    createdByName:
      exam.createdByName ??
      (exam.createdById === currentUser?.id
        ? currentUser.name
        : exam.createdById
          ? "Akun tersimpan"
          : "Tidak diketahui"),
    description: exam.description ?? "",
    questionMix: exam.questionMix ?? {
      essay: 0,
      multipleChoice: 0,
      shortAnswer: 0
    },
    shuffleOptions: exam.shuffleOptions,
    shuffleQuestions: exam.shuffleQuestions
  };
}

function mapApiParticipantToRow(participant: ApiParticipant): ParticipantRow {
  return {
    id: participant.id,
    nim: participant.nim,
    name: participant.name,
    prodi: participant.prodi,
    kelas: participant.className,
    status: participant.status ?? "Belum Mulai",
    violations: participant.violations ?? 0,
    score: participant.score ?? null
  };
}

async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!response.ok) {
    throw new Error(payload.error ?? "Request API gagal.");
  }

  return payload.data as T;
}

type EssayReview = {
  answer: string;
  feedback: string;
  id: string;
  maxScore: number;
  question: string;
  rubric: string;
  score: number | null;
};

type GradingStudent = {
  autoShortScore: number;
  autoShortMax: number;
  essays: EssayReview[];
  kelas: string;
  mcMax: number;
  mcScore: number;
  name: string;
  nim: string;
  prodi: string;
  submittedAt: string;
};

const emptyDashboard: DashboardData = {
  activeExams: 0,
  liveSessions: [],
  scoreBands: [
    { range: "0-49", value: 0, color: "bg-rose-500" },
    { range: "50-64", value: 0, color: "bg-amber-500" },
    { range: "65-79", value: 0, color: "bg-sky-500" },
    { range: "80-100", value: 0, color: "bg-emerald-500" }
  ],
  scoreSummary: {
    average: 0,
    highest: 0,
    lowest: 0,
    median: 0
  },
  totalExams: 0,
  totalParticipants: 0,
  totalViolations: 0
};

export function getValidView(view?: string | null): View | null {
  return navItems.some((item) => item.id === view) ? (view as View) : null;
}

function statusBadge(status: string) {
  if (status === "Aktif" || status === "Submit") {
    return <Badge variant="success">{status}</Badge>;
  }

  if (status === "Terjadwal" || status === "Mengerjakan") {
    return <Badge variant="info">{status}</Badge>;
  }

  if (status === "Auto Submit") {
    return <Badge variant="destructive">{status}</Badge>;
  }

  return <Badge variant="secondary">{status}</Badge>;
}

export default function HomeClient({ initialView }: { initialView: View }) {
  const session = authClient.useSession();
  const [activeView, setActiveView] = useState<View>(initialView);
  const [apiExams, setApiExams] = useState<ExamCard[]>([]);
  const [apiError, setApiError] = useState("");
  const [apiLoading, setApiLoading] = useState(false);
  const [createdExams, setCreatedExams] = useState<ExamCard[]>([]);
  const [dashboardData, setDashboardData] =
    useState<DashboardData>(emptyDashboard);
  const [examFormOpen, setExamFormOpen] = useState(false);
  const [managedParticipants, setManagedParticipants] =
    useState<ParticipantRow[]>([]);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const syncViewFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const urlView = getValidView(params.get("view")) ?? getValidView(window.location.hash.replace("#", ""));

      if (urlView) {
        setActiveView(urlView);
      }
    };

    syncViewFromUrl();
    window.addEventListener("popstate", syncViewFromUrl);

    return () => window.removeEventListener("popstate", syncViewFromUrl);
  }, []);

  const sessionUser = session.data?.user as SessionUser | undefined;
  const sessionUserId = sessionUser?.id;
  const sessionUserName = sessionUser?.name ?? "Pengguna";
  const currentRole = normalizeRole(sessionUser?.role);
  const currentUser: AppUser = {
    id: sessionUserId ?? "",
    name: sessionUserName,
    role: currentRole,
    title: currentRole === "admin" ? "Admin Prodi" : "Dosen Pengampu"
  };
  const allExams: ExamCard[] = [...createdExams, ...apiExams];
  const visibleExams = allExams.filter(
    (exam) => currentUser.role === "admin" || exam.createdById === currentUser.id
  );

  useEffect(() => {
    let isMounted = true;

    async function loadApiData() {
      if (!sessionUserId) {
        return;
      }

      const apiUser: AppUser = {
        id: sessionUserId,
        name: sessionUserName,
        role: currentRole,
        title: currentRole === "admin" ? "Admin Prodi" : "Dosen Pengampu"
      };

      setApiLoading(true);
      setApiError("");

      try {
        const [examRows, participantRows, dashboard] = await Promise.all([
          apiRequest<ApiExam[]>("/api/exams"),
          apiRequest<ApiParticipant[]>("/api/participants"),
          apiRequest<DashboardData>("/api/dashboard")
        ]);

        if (!isMounted) {
          return;
        }

        setApiExams(examRows.map((exam) => mapApiExamToCard(exam, apiUser)));
        setManagedParticipants(participantRows.map(mapApiParticipantToRow));
        setDashboardData(dashboard);
      } catch (error) {
        if (isMounted) {
          setApiError(
            error instanceof Error
              ? error.message
              : "Tidak bisa memuat data dari API."
          );
        }
      } finally {
        if (isMounted) {
          setApiLoading(false);
        }
      }
    }

    loadApiData();

    return () => {
      isMounted = false;
    };
  }, [currentRole, sessionUserId, sessionUserName]);

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }, []);

  const navigateTo = (view: View) => {
    setActiveView(view);

    const nextUrl = view === "dashboard" ? "/" : `/?view=${view}`;

    if (view !== "exams") {
      setExamFormOpen(false);
    }

    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.pushState(null, "", nextUrl);
    }
  };

  const filteredParticipants = useMemo(
    () =>
      managedParticipants.filter((participant) =>
        `${participant.nim} ${participant.name} ${participant.prodi} ${participant.kelas}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [managedParticipants, search]
  );
  const activeItem = navItems.find((item) => item.id === activeView);

  const persistExamPackage = async (
    exam: ExamCard,
    draftQuestions: DraftQuestion[],
    isEditing: boolean
  ) => {
    const durationMinutes = Number(exam.duration.replace(/\D/g, "")) || 120;
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    const payload = {
      name: exam.name,
      description: exam.description || null,
      token: exam.token,
      durationMinutes,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      shuffleQuestions: exam.shuffleQuestions ?? true,
      shuffleOptions: exam.shuffleOptions ?? true,
      status: examStatusToApi[exam.status] ?? "draft"
    };
    const savedExam = await apiRequest<ApiExam>(
      isEditing ? `/api/exams/${exam.id}` : "/api/exams",
      {
        body: JSON.stringify(payload),
        method: isEditing ? "PATCH" : "POST"
      }
    );
    const validQuestions = draftQuestions.filter(
      (question) => question.prompt.trim().length >= 5
    );

    if (!isEditing && validQuestions.length > 0) {
      await Promise.all(
        validQuestions.map((question, index) =>
          apiRequest(`/api/exams/${savedExam.id}/questions`, {
            body: JSON.stringify({
              order: index + 1,
              type:
                question.type === "Pilihan Ganda"
                  ? "multiple_choice"
                  : question.type === "Isian Singkat"
                    ? "short_answer"
                    : "essay",
              prompt: question.prompt.trim(),
              options:
                question.type === "Pilihan Ganda"
                  ? question.options
                      .filter((option) => option.text.trim())
                      .map((option) => ({
                        id: option.id,
                        text: option.text.trim()
                      }))
                  : null,
              answerKey:
                question.type === "Pilihan Ganda"
                  ? question.correctOptionId
                  : question.answerKey.trim() || null,
              score: Number(question.score) || 1
            }),
            method: "POST"
          })
        )
      );
    }

    return mapApiExamToCard(savedExam, currentUser);
  };

  if (session.isPending) {
    return <AuthShell title="Memuat sesi..." description="Menghubungkan auth client dengan server lokal." />;
  }

  if (!sessionUser) {
    return <AuthScreen onDone={() => session.refetch()} />;
  }

  return (
    <main className="min-h-screen playful-bg text-slate-950 font-sans">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="clay-sidebar mx-4 mt-4 flex flex-col justify-between px-4 py-6 lg:sticky lg:top-6 lg:m-6 lg:h-[calc(100vh-3rem)] lg:w-80 lg:shrink-0 lg:px-5">
          <div>
            <div className="clay-brand flex items-center gap-3 rounded-3xl p-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl clay-btn-success text-white shadow-sm">
                <BookOpenCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-emerald-950">Sistem Ujian Online</p>
                <p className="text-xs font-semibold text-emerald-700/80">
                  Mahasiswa berbasis token
                </p>
              </div>
            </div>

            <nav className="mt-6 grid gap-2.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;

                return (
                  <a
                    key={item.id}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex h-12 items-center gap-3 rounded-2xl px-4 text-sm font-bold transition-all active:scale-95 duration-150",
                      isActive
                        ? "clay-btn-primary text-white shadow-md"
                        : "text-slate-500 hover:bg-slate-100/80 hover:text-slate-900"
                    )}
                    href={item.id === "dashboard" ? "/" : `/?view=${item.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      navigateTo(item.id);
                    }}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </a>
                );
              })}
            </nav>
          </div>

          <div className="mt-6 rounded-2xl bg-amber-50/80 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-3px_-3px_6px_rgba(0,0,0,0.02)] border border-amber-100 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
              <ShieldAlert className="h-4 w-4" />
              Anti Kecurangan
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-amber-950/70">
              Copy, paste, klik kanan, shortcut umum, dan perpindahan tab
              dipantau. Tiga pelanggaran memicu submit otomatis.
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1 flex flex-col">
          <header className="clay-header sticky top-4 z-20 mx-4 my-4 rounded-[28px] px-5 py-4 md:mx-8 md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  Internal / {activeItem?.label}
                </p>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl text-slate-900">
                  {activeItem?.label}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="clay-soft-panel flex h-14 items-center gap-3 rounded-full px-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.6)]">
                    <UserCheck className="h-5 w-5" />
                  </div>
                  <div className="pr-2">
                    <p className="text-sm font-bold leading-5 text-slate-800">
                      {currentUser.name}
                    </p>
                    <p className="text-xs font-semibold text-slate-400">
                      {currentUser.title}
                    </p>
                  </div>
                </div>
                <Button
                  className="h-12 rounded-full px-5 shadow-sm"
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await authClient.signOut();
                    await session.refetch();
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Keluar
                </Button>
              </div>
            </div>
          </header>

          <section className="px-4 py-6 md:px-8">
            {notice && (
              <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.72),inset_-2px_-2px_5px_rgba(4,120,87,0.12)]">
                {notice}
              </div>
            )}
            {(apiLoading || apiError) && (
              <div
                className={cn(
                  "mb-4 rounded-2xl px-4 py-3 text-sm font-bold shadow-[inset_1px_1px_2px_rgba(255,255,255,0.72),inset_-2px_-2px_5px_rgba(15,23,42,0.08)]",
                  apiError
                    ? "bg-amber-50 text-amber-800"
                    : "bg-sky-50 text-sky-800"
                )}
              >
                {apiError || "Memuat data terbaru dari API..."}
              </div>
            )}
            {activeView === "dashboard" && (
              <DashboardView
                dashboard={dashboardData}
                exams={visibleExams}
                openExamRoom={() => navigateTo("exams")}
              />
            )}
            {activeView === "exams" && (
              <ExamsView
                createdExams={createdExams}
                currentUser={currentUser}
                exams={visibleExams}
                isCreating={examFormOpen}
                notify={notify}
                onPersistExam={persistExamPackage}
                setCreatedExams={setCreatedExams}
                setIsCreating={setExamFormOpen}
              />
            )}
            {activeView === "participants" && (
              <ParticipantsView
                filteredParticipants={filteredParticipants}
                participants={managedParticipants}
                notify={notify}
                search={search}
                setParticipants={setManagedParticipants}
                setSearch={setSearch}
              />
            )}
            {activeView === "grading" && (
              <GradingView exams={visibleExams} notify={notify} />
            )}
            {activeView === "analytics" && (
              <AnalyticsView dashboard={dashboardData} />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function AuthShell({
  description,
  title
}: {
  description: string;
  title: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center playful-bg px-4 text-slate-950">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl clay-btn-primary text-white">
            <BookOpenCheck className="h-6 w-6" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

function AuthScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    role: "admin" as UserRole
  });

  const updateForm = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setIsSubmitting(true);

    try {
      if (mode === "signin") {
        const result = await authClient.signIn.email({
          email: form.email,
          password: form.password
        });

        if (result.error) {
          throw new Error(result.error.message ?? "Login gagal.");
        }
      } else {
        const signUpPayload = {
          email: form.email,
          name: form.name,
          password: form.password,
          role: form.role
        } as unknown as Parameters<typeof authClient.signUp.email>[0];
        const result = await authClient.signUp.email(signUpPayload);

        if (result.error) {
          throw new Error(result.error.message ?? "Registrasi gagal.");
        }
      }

      onDone();
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "Tidak bisa menghubungkan sesi."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen playful-bg px-4 py-10 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="clay-hero p-8 text-white md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-bold shadow-[inset_1px_1px_2px_rgba(255,255,255,0.3)] backdrop-blur-sm">
            <ShieldAlert className="h-4 w-4" />
            Admin Console
          </div>
          <h1 className="mt-8 max-w-2xl text-4xl font-extrabold tracking-tight md:text-5xl">
            Sistem Ujian Online
          </h1>
          <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-white/90">
            Masuk sebagai admin untuk melihat semua paket, atau sebagai dosen
            untuk mengelola paket yang dibuat oleh akun sendiri.
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              ["Token", "Akses ujian terkunci"],
              ["Role", "Admin dan dosen"],
              ["API", "Data tersimpan lokal"]
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-3xl bg-white/14 p-4 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.24),inset_-3px_-3px_7px_rgba(15,23,42,0.14)] backdrop-blur-sm"
              >
                <p className="text-sm font-medium text-white/80">{label}</p>
                <p className="mt-1 text-sm font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{mode === "signin" ? "Masuk" : "Daftar Akun"}</CardTitle>
            <CardDescription>
              Gunakan akun Better Auth untuk membuka dashboard sesuai role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submitAuth}>
              {authError && (
                <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.7),inset_-2px_-2px_5px_rgba(190,24,74,0.12)]">
                  {authError}
                </div>
              )}

              {mode === "signup" && (
                <label className="space-y-2 text-sm font-medium">
                  Nama
                  <Input
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                  />
                </label>
              )}

              <label className="space-y-2 text-sm font-medium">
                Email
                <Input
                  autoComplete="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                />
              </label>

              <label className="space-y-2 text-sm font-medium">
                Password
                <Input
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  minLength={8}
                  type="password"
                  value={form.password}
                  onChange={(event) => updateForm("password", event.target.value)}
                />
              </label>

              {mode === "signup" && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Role</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["admin", "dosen"] as UserRole[]).map((role) => (
                      <button
                        key={role}
                        className={cn(
                          "h-11 rounded-2xl text-sm font-bold capitalize transition-all active:scale-95",
                          form.role === role
                            ? "clay-btn-primary"
                            : "clay-btn-outline text-muted-foreground hover:text-primary"
                        )}
                        type="button"
                        onClick={() => updateForm("role", role)}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button className="h-12 w-full" disabled={isSubmitting} type="submit">
                {mode === "signin"
                  ? isSubmitting
                    ? "Memproses..."
                    : "Masuk"
                  : isSubmitting
                    ? "Mendaftarkan..."
                    : "Daftar dan Masuk"}
              </Button>

              <Button
                className="h-11 w-full"
                type="button"
                variant="outline"
                onClick={() => {
                  setAuthError("");
                  setMode((current) =>
                    current === "signin" ? "signup" : "signin"
                  );
                }}
              >
                {mode === "signin"
                  ? "Belum punya akun? Daftar"
                  : "Sudah punya akun? Masuk"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function DashboardView({
  dashboard,
  exams,
  openExamRoom
}: {
  dashboard: DashboardData;
  exams: ExamCard[];
  openExamRoom: () => void;
}) {
  const dashboardStats = [
    {
      label: "Total Ujian",
      value: String(dashboard.totalExams),
      note: "Sesuai akses role aktif",
      icon: BookOpenCheck,
      tone: "bg-teal-50 text-teal-700"
    },
    {
      label: "Ujian Aktif",
      value: String(dashboard.activeExams),
      note: "Sedang berlangsung",
      icon: Activity,
      tone: "bg-sky-50 text-sky-700"
    },
    {
      label: "Total Peserta",
      value: String(dashboard.totalParticipants),
      note: "Pada paket terlihat",
      icon: UsersRound,
      tone: "bg-amber-50 text-amber-700"
    },
    {
      label: "Pelanggaran",
      value: String(dashboard.totalViolations),
      note: "Pantauan sesi aktif",
      icon: ShieldAlert,
      tone: "bg-rose-50 text-rose-700"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat) => {
          const Icon = stat.icon;
          let clayTone = "rounded-2xl p-3.5 shadow-sm";
          if (stat.tone.includes("teal")) {
            clayTone = "rounded-2xl p-3.5 bg-teal-100 text-teal-700 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.6),inset_-2px_-2px_4px_rgba(4,120,87,0.15)] border border-teal-200/30";
          } else if (stat.tone.includes("sky")) {
            clayTone = "rounded-2xl p-3.5 bg-sky-100 text-sky-700 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.6),inset_-2px_-2px_4px_rgba(3,105,161,0.15)] border border-sky-200/30";
          } else if (stat.tone.includes("amber")) {
            clayTone = "rounded-2xl p-3.5 bg-amber-100 text-amber-700 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.6),inset_-2px_-2px_4px_rgba(180,83,9,0.15)] border border-amber-200/30";
          } else if (stat.tone.includes("rose")) {
            clayTone = "rounded-2xl p-3.5 bg-rose-100 text-rose-700 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.6),inset_-2px_-2px_4px_rgba(190,24,74,0.15)] border border-rose-200/30";
          }

          return (
            <Card key={stat.label} className="clay-card-hover">
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-bold text-slate-400">{stat.label}</p>
                  <p className="mt-2 text-3xl font-black text-slate-800 tracking-tight">{stat.value}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400/80">{stat.note}</p>
                </div>
                <div className={clayTone}>
                  <Icon className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Monitor Login Peserta</CardTitle>
            <CardDescription>
              Terdeteksi otomatis setelah mahasiswa masuk menggunakan NIM dan token.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dashboard.liveSessions.length > 0 ? (
              <Badge variant="success">
                <Activity className="mr-1 h-3 w-3" />
                Ujian berjalan
              </Badge>
            ) : (
              <Badge variant="warning">Menunggu mulai</Badge>
            )}
            <Button variant="outline" size="sm" onClick={openExamRoom}>
              <Settings2 />
              Kelola Paket
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dashboard.liveSessions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mahasiswa</TableHead>
                  <TableHead>NIM</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Sisa Waktu</TableHead>
                  <TableHead>Jawaban</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.liveSessions.map((session) => (
                  <TableRow key={session.nim}>
                    <TableCell className="font-medium">{session.name}</TableCell>
                    <TableCell className="font-mono text-xs">{session.nim}</TableCell>
                    <TableCell>{session.loginAt}</TableCell>
                    <TableCell>
                      <div className="min-w-36">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="font-mono text-sm font-semibold text-primary">
                            {session.remaining}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {session.progress}%
                          </span>
                        </div>
                        <Progress value={session.progress} />
                      </div>
                    </TableCell>
                    <TableCell>{session.answered}</TableCell>
                    <TableCell>{statusBadge(session.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-md border bg-white p-5">
              <p className="font-medium">Belum ada mahasiswa yang masuk.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Klik mulai ujian pada detail paket, lalu dashboard akan mencatat
                mahasiswa login, jam masuk, progres jawaban, dan sisa waktunya.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Monitor Ujian Aktif</CardTitle>
            <CardDescription>
              Status submit, durasi, token, dan progres peserta per paket ujian.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ujian</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Jadwal</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => (
                  <TableRow key={exam.token}>
                    <TableCell>
                      <div className="font-medium">{exam.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Durasi {exam.duration}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{exam.token}</TableCell>
                    <TableCell>{exam.window}</TableCell>
                    <TableCell>
                      <div className="min-w-36">
                        <div className="mb-2 flex justify-between text-xs">
                          <span>{exam.submitted}/{exam.participants}</span>
                          <span>
                            {exam.participants
                              ? Math.round((exam.submitted / exam.participants) * 100)
                              : 0}
                            %
                          </span>
                        </div>
                        <Progress
                          value={
                            exam.participants
                              ? (exam.submitted / exam.participants) * 100
                              : 0
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(exam.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ringkasan Nilai</CardTitle>
            <CardDescription>
              Indikator cepat untuk ujian Basis Data yang sedang aktif.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              { label: "Rata-rata", value: dashboard.scoreSummary.average, icon: Gauge },
              { label: "Median", value: dashboard.scoreSummary.median, icon: BarChart3 },
              { label: "Nilai Tertinggi", value: dashboard.scoreSummary.highest, icon: CheckCircle2 },
              {
                label: "Submit Sukses",
                value: exams.reduce((total, exam) => total + exam.submitted, 0),
                icon: Upload
              }
            ].map((metric) => {
              const Icon = metric.icon;

              return (
                <div key={metric.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 text-primary" />
                      {metric.label}
                    </div>
                    <span className="text-sm font-semibold">{metric.value}</span>
                  </div>
                  <Progress value={metric.value} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ExamsView({
  createdExams,
  currentUser,
  exams: visibleExams,
  isCreating,
  notify,
  onPersistExam,
  setCreatedExams,
  setIsCreating
}: {
  createdExams: ExamCard[];
  currentUser: AppUser;
  exams: ExamCard[];
  isCreating: boolean;
  notify: (message: string) => void;
  onPersistExam: (
    exam: ExamCard,
    draftQuestions: DraftQuestion[],
    isEditing: boolean
  ) => Promise<ExamCard>;
  setCreatedExams: React.Dispatch<React.SetStateAction<ExamCard[]>>;
  setIsCreating: (value: boolean) => void;
}) {
  const createDefaultOptions = (): DraftOption[] => [
    { id: `option-a-${Date.now()}`, text: "" },
    { id: `option-b-${Date.now()}`, text: "" },
    { id: `option-c-${Date.now()}`, text: "" },
    { id: `option-d-${Date.now()}`, text: "" }
  ];
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletedExamIds, setDeletedExamIds] = useState<string[]>([]);
  const [editedExams, setEditedExams] = useState<Record<string, ExamCard>>({});
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [openExamMenuId, setOpenExamMenuId] = useState<string | null>(null);
  const [busyExamId, setBusyExamId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    autoSaveSeconds: "5",
    description: "",
    durationMinutes: "120",
    essayCount: "2",
    multipleChoiceCount: "20",
    name: "",
    shortAnswerCount: "5",
    shuffleOptions: true,
    shuffleQuestions: true,
    status: "Draft",
    token: "",
    violationLimit: "3"
  });
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([
    {
      answerKey: "",
      correctOptionId: "",
      id: "question-1",
      options: createDefaultOptions(),
      prompt: "",
      score: "2",
      type: "Pilihan Ganda"
    }
  ]);
  const examRows: ExamCard[] = visibleExams
    .map((exam) => editedExams[exam.id] ?? exam)
    .filter((exam) => !deletedExamIds.includes(exam.id));

  const updateDraft = (
    key: keyof typeof draft,
    value: string | boolean
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateDraftQuestion = (id: string, updates: Partial<DraftQuestion>) => {
    setDraftQuestions((current) =>
      current.map((question) =>
        question.id === id ? { ...question, ...updates } : question
      )
    );
  };

  const addDraftQuestion = (type: QuestionType) => {
    const options = type === "Pilihan Ganda" ? createDefaultOptions() : [];

    setDraftQuestions((current) => [
      ...current,
      {
        answerKey: "",
        correctOptionId: options[0]?.id ?? "",
        id: `question-${current.length + 1}-${Date.now()}`,
        options,
        prompt: "",
        score: type === "Esai" ? "10" : "2",
        type
      }
    ]);
  };

  const changeQuestionType = (id: string, type: QuestionType) => {
    setDraftQuestions((current) =>
      current.map((question) => {
        if (question.id !== id) {
          return question;
        }

        const options =
          type === "Pilihan Ganda" && question.options.length === 0
            ? createDefaultOptions()
            : question.options;

        return {
          ...question,
          correctOptionId:
            type === "Pilihan Ganda"
              ? question.correctOptionId || options[0]?.id || ""
              : "",
          options: type === "Pilihan Ganda" ? options : [],
          score: type === "Esai" ? "10" : "2",
          type
        };
      })
    );
  };

  const updateOption = (questionId: string, optionId: string, text: string) => {
    setDraftQuestions((current) =>
      current.map((question) =>
        question.id === questionId
          ? {
              ...question,
              options: question.options.map((option) =>
                option.id === optionId ? { ...option, text } : option
              )
            }
          : question
      )
    );
  };

  const addOption = (questionId: string) => {
    setDraftQuestions((current) =>
      current.map((question) =>
        question.id === questionId
          ? {
              ...question,
              options: [
                ...question.options,
                { id: `option-${Date.now()}`, text: "" }
              ]
            }
          : question
      )
    );
  };

  const deleteOption = (questionId: string, optionId: string) => {
    setDraftQuestions((current) =>
      current.map((question) => {
        if (question.id !== questionId || question.options.length <= 2) {
          return question;
        }

        const options = question.options.filter((option) => option.id !== optionId);

        return {
          ...question,
          correctOptionId:
            question.correctOptionId === optionId
              ? options[0]?.id ?? ""
              : question.correctOptionId,
          options
        };
      })
    );
  };

  const deleteQuestion = (questionId: string) => {
    setDraftQuestions((current) =>
      current.length === 1
        ? current
        : current.filter((question) => question.id !== questionId)
    );
  };

  const resetDraft = () => {
    setDraft((current) => ({
      ...current,
      description: "",
      durationMinutes: "120",
      essayCount: "2",
      multipleChoiceCount: "20",
      name: "",
      shortAnswerCount: "5",
      status: "Draft",
      token: ""
    }));
    setDraftQuestions([
      {
        answerKey: "",
        correctOptionId: "",
        id: "question-1",
        options: createDefaultOptions(),
        prompt: "",
        score: "2",
        type: "Pilihan Ganda"
      }
    ]);
  };

  const editExam = (exam: ExamCard) => {
    setDraft((current) => ({
      ...current,
      autoSaveSeconds: String(exam.autoSaveSeconds ?? 5),
      description: exam.description ?? "",
      durationMinutes: exam.duration.replace(/\D/g, "") || "120",
      essayCount: String(exam.questionMix?.essay ?? 2),
      multipleChoiceCount: String(exam.questionMix?.multipleChoice ?? exam.questions),
      name: exam.name,
      shortAnswerCount: String(exam.questionMix?.shortAnswer ?? 0),
      status: exam.status,
      token: exam.token,
      violationLimit: String(exam.violationLimit ?? 3)
    }));
    setEditingExamId(exam.id);
    setFormError("");
    setIsCreating(true);
    setOpenExamMenuId(null);
  };

  const getExamLink = (exam: ExamCard) => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";

    return `${origin}/ujian?token=${encodeURIComponent(exam.token)}`;
  };

  const copyExamLink = async (exam: ExamCard) => {
    const link = getExamLink(exam);

    try {
      await navigator.clipboard.writeText(link);
      notify(`Link ujian ${exam.name} disalin.`);
    } catch {
      notify(`Link ujian: ${link}`);
    }
  };

  const deleteExam = async (exam: ExamCard) => {
    if (!window.confirm(`Hapus paket ${exam.name}? Data soal, sesi, jawaban, dan nilai terkait akan ikut dihapus.`)) {
      return;
    }

    setBusyExamId(exam.id);

    try {
      await apiRequest(`/api/exams/${exam.id}`, { method: "DELETE" });
      setDeletedExamIds((current) => [...current, exam.id]);
      setCreatedExams((current) => current.filter((item) => item.id !== exam.id));
      setEditedExams((current) => {
        const next = { ...current };
        delete next[exam.id];
        return next;
      });
      setOpenExamMenuId(null);
      notify(`Paket ${exam.name} berhasil dihapus dari database.`);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : `Paket ${exam.name} belum bisa dihapus.`
      );
    } finally {
      setBusyExamId(null);
    }
  };

  const startExam = async (exam: ExamCard) => {
    const durationMinutes = Number(exam.duration.replace(/\D/g, "")) || 120;
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

    setBusyExamId(exam.id);

    try {
      const savedExam = await apiRequest<ApiExam>(`/api/exams/${exam.id}`, {
        body: JSON.stringify({
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          status: "active"
        }),
        method: "PATCH"
      });
      const startedExam = mapApiExamToCard(savedExam, currentUser);
      const isCreatedExam = createdExams.some((item) => item.id === exam.id);

      if (isCreatedExam) {
        setCreatedExams((current) =>
          current.map((item) => (item.id === exam.id ? startedExam : item))
        );
      } else {
        setEditedExams((current) => ({ ...current, [exam.id]: startedExam }));
      }

      notify(`${exam.name} dimulai. Link mahasiswa: ${getExamLink(startedExam)}`);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : `${exam.name} belum bisa dimulai.`
      );
    } finally {
      setBusyExamId(null);
    }
  };

  const saveExamPackage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const duration = Number(draft.durationMinutes);
    const multipleChoice = draftQuestions.filter(
      (question) => question.type === "Pilihan Ganda"
    ).length;
    const shortAnswer = draftQuestions.filter(
      (question) => question.type === "Isian Singkat"
    ).length;
    const essay = draftQuestions.filter((question) => question.type === "Esai").length;

    if (!draft.name.trim() || !draft.token.trim()) {
      setFormError("Nama ujian dan token wajib diisi.");
      return;
    }

    if (duration <= 0) {
      setFormError("Durasi ujian harus lebih dari 0 menit.");
      return;
    }

    const targetQuestions = draftQuestions.length;
    const filledQuestions = draftQuestions.filter((question) =>
      question.prompt.trim()
    ).length;
    const currentExam = examRows.find((exam) => exam.id === editingExamId);
    const now = Date.now();
    const newExam: ExamCard = {
      id: editingExamId ?? `exam-${now}`,
      name: draft.name.trim(),
      token: draft.token.trim().toUpperCase(),
      window: currentExam?.window ?? "Belum dimulai admin",
      duration: `${duration} menit`,
      participants: currentExam?.participants ?? 0,
      submitted: currentExam?.submitted ?? 0,
      status: draft.status as ExamCard["status"],
      questions: targetQuestions || filledQuestions,
      loggedIn: currentExam?.loggedIn ?? 0,
      autoSaveSeconds: Number(draft.autoSaveSeconds) || 5,
      createdById: currentExam?.createdById ?? currentUser.id,
      createdByName: currentExam?.createdByName ?? currentUser.name,
      description: draft.description.trim(),
      questionMix: {
        essay,
        multipleChoice,
        shortAnswer
      },
      shuffleOptions: draft.shuffleOptions,
      shuffleQuestions: draft.shuffleQuestions,
      violationLimit: Number(draft.violationLimit) || 3
    };

    setIsSaving(true);

    let examToStore = newExam;

    try {
      const savedExam = await onPersistExam(
        newExam,
        draftQuestions,
        Boolean(editingExamId)
      );

      examToStore = {
        ...newExam,
        id: savedExam.id,
        window: savedExam.window,
        createdById: savedExam.createdById ?? newExam.createdById,
        createdByName: savedExam.createdByName ?? newExam.createdByName,
        shuffleOptions: savedExam.shuffleOptions ?? newExam.shuffleOptions,
        shuffleQuestions: savedExam.shuffleQuestions ?? newExam.shuffleQuestions
      };
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Paket belum bisa disimpan ke API."
      );
      setIsSaving(false);
      return;
    }

    if (editingExamId) {
      const isCreatedExam = createdExams.some((exam) => exam.id === editingExamId);

      if (isCreatedExam) {
        setCreatedExams((current) =>
          current.map((exam) => (exam.id === editingExamId ? examToStore : exam))
        );
      } else {
        setEditedExams((current) => ({ ...current, [editingExamId]: examToStore }));
      }
    } else {
      setCreatedExams((current) => [examToStore, ...current]);
    }

    setFormError("");
    setIsSaving(false);
    setIsCreating(false);
    notify(
      editingExamId
        ? "Perubahan paket ujian berhasil disimpan."
        : "Paket ujian tersimpan. Pemilik paket bisa mulai ujian lewat tombol Mulai Ujian."
    );
    setEditingExamId(null);
    resetDraft();
  };

  if (isCreating) {
    return (
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>
              {editingExamId ? "Edit Paket Ujian" : "Form Paket Ujian Baru"}
            </CardTitle>
            <CardDescription>
              Isi paket, token, durasi, randomisasi, tipe soal, dan aturan
              pengawasan. Ujian belum punya jadwal mulai; admin memulainya
              manual dari tombol Mulai Ujian.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setFormError("");
              setEditingExamId(null);
              resetDraft();
              setIsCreating(false);
            }}
          >
            <ArrowLeft />
            Kembali
          </Button>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveExamPackage}>
            {formError && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
                {formError}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                Nama Ujian
                <Input
                  placeholder="Contoh: UAS Basis Data"
                  value={draft.name}
                  onChange={(event) => updateDraft("name", event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Token Ujian
                <Input
                  placeholder="Contoh: BD-2026-A"
                  value={draft.token}
                  onChange={(event) =>
                    updateDraft("token", event.target.value.toUpperCase())
                  }
                />
              </label>
              <label className="space-y-2 text-sm font-medium lg:col-span-2">
                Deskripsi
                <Textarea
                  placeholder="Ringkasan materi, aturan, atau catatan untuk admin."
                  value={draft.description}
                  onChange={(event) =>
                    updateDraft("description", event.target.value)
                  }
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Durasi Ujian (menit)
                <Input
                  min="1"
                  type="number"
                  value={draft.durationMinutes}
                  onChange={(event) =>
                    updateDraft("durationMinutes", event.target.value)
                  }
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Status Awal
                <Input
                  disabled
                  readOnly
                  value="Draft - menunggu admin klik Mulai Ujian"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-center gap-2 rounded-md border bg-slate-50 p-3 text-sm font-medium">
                <input
                  checked={draft.shuffleQuestions}
                  type="checkbox"
                  onChange={(event) =>
                    updateDraft("shuffleQuestions", event.target.checked)
                  }
                />
                Acak soal
              </label>
              <label className="flex items-center gap-2 rounded-md border bg-slate-50 p-3 text-sm font-medium">
                <input
                  checked={draft.shuffleOptions}
                  type="checkbox"
                  onChange={(event) =>
                    updateDraft("shuffleOptions", event.target.checked)
                  }
                />
                Acak opsi jawaban
              </label>
              <label className="space-y-1 rounded-md border bg-slate-50 p-3 text-sm font-medium">
                Auto-save (detik)
                <Input
                  min="1"
                  type="number"
                  value={draft.autoSaveSeconds}
                  onChange={(event) =>
                    updateDraft("autoSaveSeconds", event.target.value)
                  }
                />
              </label>
              <label className="space-y-1 rounded-md border bg-slate-50 p-3 text-sm font-medium">
                Batas pelanggaran
                <Input
                  min="1"
                  type="number"
                  value={draft.violationLimit}
                  onChange={(event) =>
                    updateDraft("violationLimit", event.target.value)
                  }
                />
              </label>
            </div>

            <div className="rounded-md border bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">Soal Awal</p>
                  <p className="text-sm text-muted-foreground">
                    Tambahkan contoh soal sekarang, sisanya bisa dilengkapi
                    setelah paket tersimpan.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => addDraftQuestion("Pilihan Ganda")}
                  >
                    <ListChecks />
                    PG
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => addDraftQuestion("Isian Singkat")}
                  >
                    <CheckCircle2 />
                    Isian
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => addDraftQuestion("Esai")}
                  >
                    <PenLine />
                    Esai
                  </Button>
                </div>
              </div>

                <div className="mt-3 space-y-3">
                  {draftQuestions.map((question, index) => (
                    <div
                      className="rounded-md border bg-slate-50 p-3"
                      key={question.id}
                    >
                      <div className="grid gap-3 lg:grid-cols-[170px_1fr_170px_44px]">
                        <label className="space-y-2 text-sm font-medium">
                          Tipe
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={question.type}
                            onChange={(event) =>
                              changeQuestionType(
                                question.id,
                                event.target.value as QuestionType
                              )
                            }
                          >
                            <option value="Pilihan Ganda">Pilihan Ganda</option>
                            <option value="Isian Singkat">Isian Singkat</option>
                            <option value="Esai">Esai</option>
                          </select>
                        </label>
                        <label className="space-y-2 text-sm font-medium">
                          Pertanyaan {index + 1}
                          <Input
                            placeholder="Tulis pertanyaan awal"
                            value={question.prompt}
                            onChange={(event) =>
                              updateDraftQuestion(question.id, {
                                prompt: event.target.value
                              })
                            }
                          />
                        </label>
                        <label className="space-y-2 text-sm font-medium">
                          {question.type === "Esai"
                            ? "Bobot manual"
                            : "Skor jawaban benar"}
                          <Input
                            min="1"
                            type="number"
                            value={question.score}
                            onChange={(event) =>
                              updateDraftQuestion(question.id, {
                                score: event.target.value
                              })
                            }
                          />
                        </label>
                        <Button
                          className="self-end"
                          size="icon"
                          type="button"
                          variant="outline"
                          aria-label={`Hapus pertanyaan ${index + 1}`}
                          onClick={() => deleteQuestion(question.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>

                      {question.type === "Pilihan Ganda" && (
                        <div className="mt-3 rounded-md border bg-white p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-medium">Opsi Jawaban</p>
                              <p className="text-xs text-muted-foreground">
                                Pilih satu kunci jawaban. Skor otomatis diberikan
                                ketika peserta memilih opsi benar.
                              </p>
                            </div>
                            <Button
                              size="sm"
                              type="button"
                              variant="outline"
                              onClick={() => addOption(question.id)}
                            >
                              <Plus />
                              Tambah Opsi
                            </Button>
                          </div>
                          <div className="mt-3 space-y-2">
                            {question.options.map((option, optionIndex) => (
                              <div
                                className="grid gap-2 sm:grid-cols-[100px_1fr_44px]"
                                key={option.id}
                              >
                                <label className="flex items-center gap-2 rounded-md border bg-slate-50 px-3 text-sm font-medium">
                                  <input
                                    checked={question.correctOptionId === option.id}
                                    name={`answer-${question.id}`}
                                    type="radio"
                                    onChange={() =>
                                      updateDraftQuestion(question.id, {
                                        correctOptionId: option.id
                                      })
                                    }
                                  />
                                  Kunci {String.fromCharCode(65 + optionIndex)}
                                </label>
                                <Input
                                  placeholder={`Opsi ${String.fromCharCode(65 + optionIndex)}`}
                                  value={option.text}
                                  onChange={(event) =>
                                    updateOption(
                                      question.id,
                                      option.id,
                                      event.target.value
                                    )
                                  }
                                />
                                <Button
                                  size="icon"
                                  type="button"
                                  variant="outline"
                                  aria-label={`Hapus opsi ${optionIndex + 1}`}
                                  onClick={() => deleteOption(question.id, option.id)}
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {question.type === "Isian Singkat" && (
                        <label className="mt-3 block space-y-2 text-sm font-medium">
                          Kunci Jawaban Isian
                          <Input
                            placeholder="Contoh: primary key"
                            value={question.answerKey}
                            onChange={(event) =>
                              updateDraftQuestion(question.id, {
                                answerKey: event.target.value
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFormError("");
                  setEditingExamId(null);
                  resetDraft();
                  setIsCreating(false);
                }}
              >
                Batal
              </Button>
              <Button disabled={isSaving} type="submit">
                <CheckCircle2 />
                {isSaving
                  ? "Menyimpan..."
                  : editingExamId
                    ? "Simpan Perubahan"
                    : "Simpan Paket"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Paket Ujian</CardTitle>
            <CardDescription>
              {currentUser.role === "admin"
                ? "Admin dapat melihat seluruh paket dari semua dosen."
                : "Dosen hanya dapat melihat dan mengelola paket yang dibuat akun ini."}
            </CardDescription>
          </div>
          <Button onClick={() => setIsCreating(true)}>
            <Plus />
            Buat Paket
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            {examRows.length === 0 && (
              <div className="rounded-md border border-dashed bg-white p-8 text-center">
                <p className="font-semibold">Belum ada paket milik akun ini.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Klik Buat Paket untuk membuat paket pertama sebagai dosen ini.
                </p>
              </div>
            )}
            {examRows.map((exam) => (
              <div
                key={exam.token}
                className="rounded-md border bg-white p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{exam.name}</h2>
                      {statusBadge(exam.status)}
                    </div>
	                    <p className="mt-1 text-sm text-muted-foreground">
	                      {exam.window} - {exam.duration}
	                    </p>
	                    <p className="mt-1 text-xs text-muted-foreground">
	                      Dibuat oleh {exam.createdByName ?? "Admin/Dosen"}
	                    </p>
	                  </div>
                  <div className="relative flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Pengaturan ujian"
                      onClick={() => editExam(exam)}
                    >
                      <Settings2 />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Mulai ujian"
                      disabled={busyExamId === exam.id}
                      onClick={() => startExam(exam)}
                    >
                      <PlayCircle />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Salin link ujian"
                      onClick={() => copyExamLink(exam)}
                    >
                      <Link2 />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Menu lainnya"
                      onClick={() =>
                        setOpenExamMenuId((current) =>
                          current === exam.id ? null : exam.id
                        )
                      }
                    >
                      <MoreHorizontal />
                    </Button>
                    {openExamMenuId === exam.id && (
                      <div className="absolute right-0 top-11 z-30 w-44 rounded-md border bg-white p-1 shadow-soft">
                        <button
                          className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
                          type="button"
                          onClick={() => copyExamLink(exam)}
                        >
                          <Copy className="h-4 w-4" />
                          Salin Link
                        </button>
                        <a
                          className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
                          href={getExamLink(exam)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Buka Link
                        </a>
                        <button
                          className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
                          type="button"
                          onClick={() => editExam(exam)}
                        >
                          <PenLine className="h-4 w-4" />
                          Edit Paket
                        </button>
                        <button
                          className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                          type="button"
                          disabled={busyExamId === exam.id}
                          onClick={() => deleteExam(exam)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Hapus Paket
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <InfoPill label="Token" value={exam.token} />
                  <InfoPill label="Peserta" value={`${exam.participants} orang`} />
                  <InfoPill
                    label="Submit"
                    value={`${exam.submitted}/${exam.participants}`}
                  />
                </div>
                <div className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-900 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.7),inset_-2px_-2px_5px_rgba(3,105,161,0.12)]">
                  Link mahasiswa:{" "}
                  <a
                    className="font-black text-sky-700 underline-offset-4 hover:underline"
                    href={getExamLink(exam)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {getExamLink(exam)}
                  </a>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(exam.shuffleQuestions ?? true) && (
                    <Badge variant="info">
                      <Shuffle className="mr-1 h-3 w-3" />
                      Acak Soal
                    </Badge>
                  )}
                  {(exam.shuffleOptions ?? true) && (
                    <Badge variant="info">
                      <Shuffle className="mr-1 h-3 w-3" />
                      Acak Opsi
                    </Badge>
                  )}
                  <Badge variant="warning">
                    <Clock3 className="mr-1 h-3 w-3" />
                    Auto save {exam.autoSaveSeconds ?? 5} detik
                  </Badge>
                  <Badge variant="secondary">
                    <ShieldAlert className="mr-1 h-3 w-3" />
                    {exam.violationLimit ?? 3} pelanggaran auto submit
                  </Badge>
                </div>
                {exam.questionMix && (
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <span>PG: {exam.questionMix.multipleChoice}</span>
                    <span>Isian: {exam.questionMix.shortAnswer}</span>
                    <span>Esai: {exam.questionMix.essay}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

function ParticipantsView({
  filteredParticipants,
  notify,
  participants,
  search,
  setParticipants,
  setSearch
}: {
  filteredParticipants: ParticipantRow[];
  notify: (message: string) => void;
  participants: ParticipantRow[];
  search: string;
  setParticipants: React.Dispatch<React.SetStateAction<ParticipantRow[]>>;
  setSearch: (value: string) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [participantDraft, setParticipantDraft] = useState({
    kelas: "",
    name: "",
    nim: "",
    prodi: ""
  });
  const registeredNims = new Set(participants.map((participant) => participant.nim));

  const updateParticipantDraft = (
    key: keyof typeof participantDraft,
    value: string
  ) => {
    setParticipantDraft((current) => ({ ...current, [key]: value }));
  };

  const saveManualParticipant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !participantDraft.nim.trim() ||
      !participantDraft.name.trim() ||
      !participantDraft.prodi.trim() ||
      !participantDraft.kelas.trim()
    ) {
      notify("Lengkapi NIM, nama, prodi, dan kelas peserta.");
      return;
    }

    if (registeredNims.has(participantDraft.nim.trim())) {
      notify(`NIM ${participantDraft.nim.trim()} sudah terdaftar.`);
      return;
    }

    try {
      const savedParticipant = await apiRequest<ApiParticipant>("/api/participants", {
        body: JSON.stringify({
          className: participantDraft.kelas.trim(),
          name: participantDraft.name.trim(),
          nim: participantDraft.nim.trim(),
          prodi: participantDraft.prodi.trim()
        }),
        method: "POST"
      });

      setParticipants((current) => [
        mapApiParticipantToRow(savedParticipant),
        ...current
      ]);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Peserta belum bisa disimpan ke API."
      );
      return;
    }

    setParticipantDraft({ kelas: "", name: "", nim: "", prodi: "" });
    setIsAdding(false);
    notify("Peserta manual berhasil ditambahkan.");
  };

  const resetParticipant = (nim: string, name: string) => {
    setParticipants((current) =>
      current.map((participant) =>
        participant.nim === nim
          ? {
              ...participant,
              score: null,
              status: "Belum Mulai",
              violations: 0
            }
          : participant
      )
    );
    notify(`Login ${name} berhasil direset.`);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Manajemen Peserta</CardTitle>
                <CardDescription>
                  Peserta hanya dapat masuk jika NIM sudah terdaftar.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setIsAdding((current) => !current)}>
                  <Plus />
                  {isAdding ? "Tutup Form" : "Tambah Manual"}
                </Button>
              </div>
            </div>
            {isAdding && (
              <form
                className="grid gap-3 rounded-md border bg-slate-50 p-3 md:grid-cols-4"
                onSubmit={saveManualParticipant}
              >
                <Input
                  placeholder="NIM"
                  value={participantDraft.nim}
                  onChange={(event) =>
                    updateParticipantDraft("nim", event.target.value)
                  }
                />
                <Input
                  placeholder="Nama mahasiswa"
                  value={participantDraft.name}
                  onChange={(event) =>
                    updateParticipantDraft("name", event.target.value)
                  }
                />
                <Input
                  placeholder="Prodi"
                  value={participantDraft.prodi}
                  onChange={(event) =>
                    updateParticipantDraft("prodi", event.target.value)
                  }
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Kelas"
                    value={participantDraft.kelas}
                    onChange={(event) =>
                      updateParticipantDraft("kelas", event.target.value)
                    }
                  />
                  <Button type="submit">
                    <CheckCircle2 />
                    Simpan
                  </Button>
                </div>
              </form>
            )}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari NIM, nama, prodi, atau kelas"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NIM</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Prodi</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pelanggaran</TableHead>
                  <TableHead>Nilai</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParticipants.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="py-8 text-center text-muted-foreground"
                      colSpan={8}
                    >
                      Tidak ada peserta yang cocok dengan pencarian.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredParticipants.map((participant) => (
                    <TableRow key={participant.nim}>
                      <TableCell className="font-mono text-xs">
                        {participant.nim}
                      </TableCell>
                      <TableCell className="font-medium">{participant.name}</TableCell>
                      <TableCell>{participant.prodi}</TableCell>
                      <TableCell>{participant.kelas}</TableCell>
                      <TableCell>{statusBadge(participant.status)}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "font-semibold",
                            participant.violations >= 3
                              ? "text-rose-700"
                              : participant.violations > 0
                                ? "text-amber-700"
                                : "text-emerald-700"
                          )}
                        >
                          {participant.violations}/3
                        </span>
                      </TableCell>
                      <TableCell>{participant.score ?? "-"}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            resetParticipant(participant.nim, participant.name)
                          }
                        >
                          <RefreshCcw />
                          Reset
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data API</CardTitle>
            <CardDescription>
              Seluruh peserta di tabel ini berasal dari endpoint peserta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-white p-4">
              <p className="text-sm font-medium">
                {participants.length} peserta tersimpan.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tambah manual akan langsung disimpan ke database melalui API.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GradingView({
  exams,
  notify
}: {
  exams: ExamCard[];
  notify: (message: string) => void;
}) {
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [selectedStudentNim, setSelectedStudentNim] = useState("");
  const [gradingMode, setGradingMode] = useState<"list" | "detail">("list");
  const [gradingLoading, setGradingLoading] = useState(false);
  const [gradingSearch, setGradingSearch] = useState("");
  const [gradingStudents, setGradingStudents] = useState<GradingStudent[]>([]);
  const selectedExam = exams.find((exam) => exam.id === selectedExamId);
  const selectedStudent =
    gradingStudents.find((student) => student.nim === selectedStudentNim) ??
    gradingStudents[0];
  const filteredGradingStudents = gradingStudents.filter((student) =>
    `${student.nim} ${student.name} ${student.prodi} ${student.kelas}`
      .toLowerCase()
      .includes(gradingSearch.toLowerCase())
  );
  const totalEssayCount = gradingStudents.reduce(
    (total, student) => total + student.essays.length,
    0
  );
  const gradedEssayCount = gradingStudents.reduce(
    (total, student) =>
      total + student.essays.filter((essay) => essay.score !== null).length,
    0
  );
  const studentsNeedReview = gradingStudents.filter((student) =>
    student.essays.some((essay) => essay.score === null)
  ).length;
  const gradingProgress = totalEssayCount
    ? Math.round((gradedEssayCount / totalEssayCount) * 100)
    : 0;
  const averageScore = Math.round(
    gradingStudents.reduce(
      (total, student) => total + calculateStudentScore(student).earned,
      0
    ) / Math.max(gradingStudents.length, 1)
  );

  useEffect(() => {
    let isMounted = true;

    async function loadGradingStudents() {
      if (!selectedExamId) {
        setGradingStudents([]);
        setSelectedStudentNim("");
        return;
      }

      setGradingLoading(true);

      try {
        const rows = await apiRequest<GradingStudent[]>(
          `/api/grading/${selectedExamId}`
        );

        if (!isMounted) {
          return;
        }

        setGradingStudents(rows);
        setSelectedStudentNim(rows[0]?.nim ?? "");
      } catch (error) {
        if (isMounted) {
          setGradingStudents([]);
          setSelectedStudentNim("");
          notify(
            error instanceof Error
              ? error.message
              : "Data penilaian belum bisa dimuat."
          );
        }
      } finally {
        if (isMounted) {
          setGradingLoading(false);
        }
      }
    }

    loadGradingStudents();

    return () => {
      isMounted = false;
    };
  }, [notify, selectedExamId]);

  const updateEssayReview = (
    nim: string,
    essayId: string,
    updates: Partial<Pick<EssayReview, "feedback" | "score">>
  ) => {
    setGradingStudents((current) =>
      current.map((student) =>
        student.nim === nim
          ? {
              ...student,
              essays: student.essays.map((essay) =>
                essay.id === essayId ? { ...essay, ...updates } : essay
              )
            }
          : student
      )
    );
  };

  const saveStudentScore = () => {
    if (!selectedStudent) {
      return;
    }

    const missingScores = selectedStudent.essays.filter(
      (essay) => essay.score === null
    ).length;

    notify(
      missingScores
        ? `${selectedStudent.name} masih punya ${missingScores} esai belum diberi skor.`
        : `Nilai ${selectedStudent.name} tersimpan.`
    );
  };

  const openNextUngraded = () => {
    const nextStudent =
      gradingStudents.find(
        (student) =>
          student.nim !== selectedStudent?.nim &&
          student.essays.some((essay) => essay.score === null)
      ) ??
      gradingStudents.find((student) =>
        student.essays.some((essay) => essay.score === null)
      );

    if (nextStudent) {
      setSelectedStudentNim(nextStudent.nim);
      notify(`Membuka jawaban ${nextStudent.name} yang belum selesai dinilai.`);
      return;
    }

    notify("Semua jawaban esai pada paket ini sudah dinilai.");
  };

  if (!selectedExam) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pilih Paket untuk Penilaian</CardTitle>
          <CardDescription>
            Penilaian dilakukan per paket soal agar dosen/admin masuk ke konteks
            ujian yang tepat sebelum mengoreksi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {exams.map((exam) => (
            <div key={exam.id} className="rounded-md border bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{exam.name}</h2>
                    {statusBadge(exam.status)}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Token {exam.token} - {exam.duration} - {exam.submitted}/
                    {exam.participants} submit
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedExamId(exam.id);
                    setGradingMode("list");
                    notify(`Masuk ke penilaian paket ${exam.name}.`);
                  }}
                >
                  <PenLine />
                  Masuk Penilaian
                </Button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InfoPill label="Soal" value={`${exam.questions} butir`} />
                <InfoPill
                  label="Otomatis"
                  value={`${exam.questionMix?.multipleChoice ?? 0} PG + ${
                    exam.questionMix?.shortAnswer ?? 0
                  } isian`}
                />
                <InfoPill
                  label="Manual"
                  value={`${exam.questionMix?.essay ?? 0} esai`}
                />
                <InfoPill
                  label="Belum Dinilai"
                  value={`${studentsNeedReview} mahasiswa`}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (gradingLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Memuat Penilaian</CardTitle>
          <CardDescription>
            Mengambil roster, jawaban, dan skor dari API penilaian.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!selectedStudent) {
    return (
      <Card>
        <CardHeader>
          <Button
            className="mb-3 w-fit"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => setSelectedExamId(null)}
          >
            <ArrowLeft />
            Kembali ke Paket
          </Button>
          <CardTitle>Belum Ada Data Penilaian</CardTitle>
          <CardDescription>
            Paket ini belum memiliki peserta dengan sesi/jawaban yang bisa
            dinilai.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const selectedScore = calculateStudentScore(selectedStudent);
  const selectedUngradedEssays = selectedStudent.essays.filter(
    (essay) => essay.score === null
  ).length;

  if (gradingMode === "detail") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Button
                className="mb-3"
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setGradingMode("list")}
              >
                <ArrowLeft />
                Kembali ke Daftar
              </Button>
              <p className="text-xs font-semibold uppercase text-primary">
                Penilaian / Detail Mahasiswa
              </p>
              <CardTitle>{selectedStudent.name}</CardTitle>
              <CardDescription>
                {selectedExam.name} - {selectedStudent.nim} -{" "}
                {selectedStudent.prodi} - {selectedStudent.kelas}
              </CardDescription>
            </div>
            {selectedUngradedEssays ? (
              <Badge variant="warning">
                {selectedUngradedEssays} esai belum dinilai
              </Badge>
            ) : (
              <Badge variant="success">Siap finalisasi</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoPill
                label="Skor PG"
                value={`${selectedStudent.mcScore}/${selectedStudent.mcMax}`}
              />
              <InfoPill
                label="Isian otomatis"
                value={`${selectedStudent.autoShortScore}/${selectedStudent.autoShortMax}`}
              />
              <InfoPill
                label={selectedUngradedEssays ? "Total sementara" : "Total akhir"}
                value={`${selectedScore.earned}/${selectedScore.max}`}
              />
            </div>

            <div className="rounded-md border bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">Komposisi nilai</span>
                <span className="font-semibold text-primary">
                  {selectedScore.percent}%
                </span>
              </div>
              <Progress value={selectedScore.percent} />
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <span>PG: {selectedStudent.mcScore} poin</span>
                <span>Isian: {selectedStudent.autoShortScore} poin</span>
                <span>Esai: {selectedScore.essayEarned} poin</span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold">Jawaban Esai</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Baca jawaban mahasiswa, isi skor per esai, lalu simpan nilai.
              </p>
            </div>

            {selectedStudent.essays.map((essay, index) => (
              <div key={essay.id} className="space-y-3 rounded-md border bg-white p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      Esai {index + 1} - maksimal {essay.maxScore} poin
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {essay.question}
                    </p>
                  </div>
                  {essay.score === null ? (
                    <Badge variant="warning">Belum dinilai</Badge>
                  ) : (
                    <Badge variant="success">Skor {essay.score}</Badge>
                  )}
                </div>

                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Jawaban mahasiswa
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {essay.answer}
                  </p>
                </div>

                <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                  <span className="font-semibold">Rubrik: </span>
                  {essay.rubric}
                </div>

                <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                  <label className="space-y-2 text-sm font-medium">
                    Skor Esai
                    <Input
                      max={essay.maxScore}
                      min={0}
                      placeholder={`0-${essay.maxScore}`}
                      type="number"
                      value={essay.score ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;

                        updateEssayReview(selectedStudent.nim, essay.id, {
                          score:
                            value === ""
                              ? null
                              : Math.min(
                                  essay.maxScore,
                                  Math.max(0, Number(value))
                                )
                        });
                      }}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Catatan untuk mahasiswa
                    <Textarea
                      placeholder="Tulis umpan balik singkat untuk jawaban ini"
                      value={essay.feedback}
                      onChange={(event) =>
                        updateEssayReview(selectedStudent.nim, essay.id, {
                          feedback: event.target.value
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button onClick={saveStudentScore}>
                <CheckCircle2 />
                Simpan Nilai
              </Button>
              <Button variant="outline" onClick={openNextUngraded}>
                <Clock3 />
                Berikutnya Belum Dinilai
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-0 bg-[linear-gradient(135deg,#007a5a_0%,#008678_52%,#0f6f83_100%)] text-white">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge className="border-white/20 bg-white/15 text-white">
                Penilaian / Paket Ujian
              </Badge>
              <h2 className="mt-5 text-3xl font-semibold md:text-4xl">
                Daftar Penilaian Esai
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/85 md:text-base">
                {selectedExam.name} - Token {selectedExam.token}. Pilih mahasiswa
                pada tabel untuk membuka halaman koreksi esai secara penuh.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                type="button"
                variant="outline"
                onClick={() => setSelectedExamId(null)}
              >
                <ArrowLeft />
                Kembali ke Paket
              </Button>
              {statusBadge(selectedExam.status)}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Mahasiswa submit</p>
            <p className="mt-2 text-3xl font-semibold">
              {gradingStudents.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mengikuti paket ini
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Belum dinilai esai</p>
            <p className="mt-2 text-3xl font-semibold">{studentsNeedReview}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mahasiswa perlu koreksi
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Progress koreksi</p>
            <p className="mt-2 text-3xl font-semibold">{gradingProgress}%</p>
            <Progress className="mt-3" value={gradingProgress} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Rata-rata sementara</p>
            <p className="mt-2 text-3xl font-semibold">{averageScore}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              PG, isian, dan esai terskor
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Daftar Mahasiswa</CardTitle>
                <Badge variant="secondary">{gradingStudents.length} data</Badge>
              </div>
              <CardDescription>
                Cari mahasiswa, lihat status esai, lalu masuk ke halaman nilai.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cari nama, NIM, prodi, atau kelas"
              value={gradingSearch}
              onChange={(event) => setGradingSearch(event.target.value)}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mahasiswa</TableHead>
                <TableHead>NIM</TableHead>
                <TableHead>Kelas</TableHead>
                <TableHead>Skor PG</TableHead>
                <TableHead>Esai</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGradingStudents.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={8}
                  >
                    Tidak ada mahasiswa yang cocok dengan pencarian.
                  </TableCell>
                </TableRow>
              ) : (
                filteredGradingStudents.map((student) => {
                  const score = calculateStudentScore(student);
                  const missingEssays = student.essays.filter(
                    (essay) => essay.score === null
                  ).length;

                  return (
                    <TableRow key={student.nim}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
                            {getInitials(student.name)}
                          </div>
                          <div>
                            <p className="font-semibold">{student.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {student.prodi}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{student.nim}</TableCell>
                      <TableCell>{student.kelas}</TableCell>
                      <TableCell className="font-semibold">
                        {student.mcScore}/{student.mcMax}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {score.essayEarned}/{score.essayMax}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {score.earned}/{score.max}
                      </TableCell>
                      <TableCell>
                        {missingEssays ? (
                          <Badge variant="warning">Belum {missingEssays}</Badge>
                        ) : (
                          <Badge variant="success">Esai selesai</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={missingEssays ? "default" : "outline"}
                          onClick={() => {
                            setSelectedStudentNim(student.nim);
                            setGradingMode("detail");
                            notify(`Masuk halaman nilai ${student.name}.`);
                          }}
                        >
                          <PenLine />
                          Nilai Esai
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function calculateStudentScore(student: GradingStudent) {
  const essayEarned = student.essays.reduce(
    (total, essay) => total + (essay.score ?? 0),
    0
  );
  const essayMax = student.essays.reduce(
    (total, essay) => total + essay.maxScore,
    0
  );
  const earned = student.mcScore + student.autoShortScore + essayEarned;
  const max = student.mcMax + student.autoShortMax + essayMax;

  return {
    earned,
    essayEarned,
    essayMax,
    max,
    percent: Math.round((earned / Math.max(max, 1)) * 100)
  };
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function AnalyticsView({ dashboard }: { dashboard: DashboardData }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Nilai tertinggi", String(dashboard.scoreSummary.highest)],
          ["Nilai terendah", String(dashboard.scoreSummary.lowest)],
          ["Rata-rata", String(dashboard.scoreSummary.average)],
          ["Median", String(dashboard.scoreSummary.median)]
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Distribusi Nilai</CardTitle>
            <CardDescription>
              Persentase peserta berdasarkan rentang nilai akhir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.scoreBands.map((band) => (
              <div key={band.range} className="grid grid-cols-[64px_1fr_44px] items-center gap-3">
                <span className="text-sm font-medium">{band.range}</span>
                <div className="h-8 rounded-md bg-muted">
                  <div
                    className={cn("h-8 rounded-md", band.color)}
                    style={{ width: `${band.value}%` }}
                  />
                </div>
                <span className="text-right text-sm font-semibold">{band.value}%</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analisis Soal dan Pelanggaran</CardTitle>
            <CardDescription>
              Butir dengan rasio salah tinggi dan pola pelanggaran peserta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-white p-4">
                <ShieldAlert className="h-5 w-5 text-rose-700" />
                <p className="mt-3 font-semibold">Total Pelanggaran</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dashboard.totalViolations} kejadian tercatat dari sesi ujian
                  yang tersimpan di database.
                </p>
              </div>
              <div className="rounded-md border bg-white p-4">
                <TimerReset className="h-5 w-5 text-sky-700" />
                <p className="mt-3 font-semibold">Ujian Aktif</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dashboard.activeExams} paket sedang aktif berdasarkan status
                  ujian di database.
                </p>
              </div>
              <div className="rounded-md border bg-white p-4">
                <Download className="h-5 w-5 text-emerald-700" />
                <p className="mt-3 font-semibold">Total Peserta</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dashboard.totalParticipants} peserta tersimpan dan siap
                  direkap dari API.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
