"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  FileSpreadsheet,
  Gauge,
  IdCard,
  KeyRound,
  Link2,
  LayoutDashboard,
  ListChecks,
  MoreHorizontal,
  PenLine,
  Plus,
  PlayCircle,
  Radio,
  RefreshCcw,
  Search,
  Settings2,
  ShieldAlert,
  Shuffle,
  StopCircle,
  TimerReset,
  Trash2,
  Upload,
  UserCheck,
  UserCog,
  UserPlus,
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
  | "analytics"
  | "users"
  | "profile";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "exams", label: "Paket Ujian", icon: BookOpenCheck },
  { id: "grading", label: "Penilaian", icon: PenLine },
  { id: "analytics", label: "Analitik", icon: BarChart3 },
  { id: "users", label: "Manajemen Pengguna", icon: UserCog, adminOnly: true },
  { id: "profile", label: "Profil", icon: IdCard }
] satisfies {
  adminOnly?: boolean;
  id: View;
  label: string;
  icon: typeof LayoutDashboard;
}[];

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
  violationLimit: number;
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

type ManagedUser = {
  createdAt: string;
  email: string;
  id: string;
  name: string;
  role: UserRole;
  updatedAt: string;
};

type ImportParticipantsResult = {
  createdParticipants: number;
  importedRows: number;
  registeredParticipants: number;
  totalParticipants: number;
};

type ExamRosterRow = {
  id: string;
  participant: ApiParticipant;
  score: number | null;
  startedAt: string | null;
  status: string;
  submittedAt: string | null;
  violations: number;
};

type ExamParticipantMutationResult = ExamRosterRow & {
  totalParticipants?: number;
};

type DeleteExamParticipantResult = {
  deleted: boolean;
  id: string;
  totalParticipants: number;
};

type ApiQuestion = {
  id: string;
  order: number;
  type: "essay" | "multiple_choice" | "short_answer";
};

type ExamDetailData = {
  questions: ApiQuestion[];
  roster: ExamRosterRow[];
};

type ExamMonitorRow = {
  answeredCount: number;
  className: string;
  nim: string;
  name: string;
  participantId: string;
  prodi: string;
  questionCount: number;
  registrationId: string;
  registrationStatus: string;
  registeredStartedAt: string | null;
  registeredSubmittedAt: string | null;
  score: number | null;
  sessionExpiresAt: string | null;
  sessionId: string | null;
  sessionStartedAt: string | null;
  sessionStatus: string | null;
  sessionSubmittedAt: string | null;
  violations: number;
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
    shuffleQuestions: exam.shuffleQuestions,
    violationLimit: exam.violationLimit ?? 3
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
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers
      }
    });
  } catch {
    throw new Error(
      "Koneksi ke server gagal. Refresh halaman atau cek konfigurasi deployment Vercel."
    );
  }

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
    return (
      <Badge variant="success">
        {status === "Aktif" ? "Ujian sedang berlangsung" : status}
      </Badge>
    );
  }

  if (status === "Terjadwal" || status === "Mengerjakan") {
    return <Badge variant="info">{status}</Badge>;
  }

  if (status === "Auto Submit") {
    return <Badge variant="destructive">{status}</Badge>;
  }

  return <Badge variant="secondary">{status}</Badge>;
}

function examParticipantStatusBadge(status: string) {
  if (status === "submitted") {
    return <Badge variant="success">Submit</Badge>;
  }

  if (status === "auto_submitted") {
    return <Badge variant="destructive">Auto submit</Badge>;
  }

  if (status === "in_progress") {
    return <Badge variant="info">Mengerjakan</Badge>;
  }

  return <Badge variant="secondary">Terdaftar</Badge>;
}

function monitorStatusBadge(row: ExamMonitorRow) {
  if (row.sessionStatus === "in_progress") {
    return <Badge variant="info">Sedang login</Badge>;
  }

  if (row.sessionStatus === "submitted" || row.registrationStatus === "submitted") {
    return <Badge variant="success">Submit</Badge>;
  }

  if (
    row.sessionStatus === "auto_submitted" ||
    row.registrationStatus === "auto_submitted"
  ) {
    return <Badge variant="destructive">Dihentikan paksa</Badge>;
  }

  return <Badge variant="secondary">Belum login</Badge>;
}

function formatShortDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("id-ID", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  });
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
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
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

  useEffect(() => {
    if (sessionUserId && activeView === "users" && currentRole !== "admin") {
      navigateTo("dashboard");
    }
  }, [activeView, currentRole, sessionUserId]);

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
        const [examRows, participantRows, dashboard, userRows] = await Promise.all([
          apiRequest<ApiExam[]>("/api/exams"),
          apiRequest<ApiParticipant[]>("/api/participants"),
          apiRequest<DashboardData>("/api/dashboard"),
          currentRole === "admin"
            ? apiRequest<ManagedUser[]>("/api/users")
            : Promise.resolve([] as ManagedUser[])
        ]);

        if (!isMounted) {
          return;
        }

        setApiExams(examRows.map((exam) => mapApiExamToCard(exam, apiUser)));
        setManagedParticipants(participantRows.map(mapApiParticipantToRow));
        setDashboardData(dashboard);
        setManagedUsers(userRows);
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

    const nextUrl = view === "dashboard" ? "/admin" : `/admin?view=${view}`;

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
  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || currentUser.role === "admin"
  );

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
      durationMinutes,
      violationLimit: exam.violationLimit ?? 3,
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
    const questionPayload = draftQuestions.map((question, index) => ({
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
    }));

    await apiRequest(`/api/exams/${savedExam.id}/questions`, {
      body: JSON.stringify(questionPayload),
      method: "PUT"
    });

    return mapApiExamToCard(savedExam, currentUser);
  };

  if (session.isPending) {
    return <AuthShell title="Memuat sesi..." description="Menghubungkan auth client dengan server aplikasi." />;
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
              {visibleNavItems.map((item) => {
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
                    href={item.id === "dashboard" ? "/admin" : `/admin?view=${item.id}`}
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
              dipantau. Batas pelanggaran mengikuti setting paket ujian.
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
            {activeView === "users" && currentUser.role === "admin" && (
              <UsersManagementView
                notify={notify}
                setUsers={setManagedUsers}
                users={managedUsers}
              />
            )}
            {activeView === "profile" && (
              <ProfileView
                currentUser={currentUser}
                notify={notify}
                onUpdated={() => session.refetch()}
              />
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
  const [detailExamId, setDetailExamId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRoster, setDetailRoster] = useState<ExamRosterRow[]>([]);
  const [detailTab, setDetailTab] = useState<"participants" | "monitor">(
    "participants"
  );
  const [editingRosterId, setEditingRosterId] = useState<string | null>(null);
  const [participantActionId, setParticipantActionId] = useState<string | null>(
    null
  );
  const [participantDraft, setParticipantDraft] = useState({
    name: "",
    nim: ""
  });
  const [participantFormOpen, setParticipantFormOpen] = useState(false);
  const [participantSaving, setParticipantSaving] = useState(false);
  const [rosterEditDraft, setRosterEditDraft] = useState({
    name: "",
    nim: ""
  });
  const [forceStoppingSessionId, setForceStoppingSessionId] =
    useState<string | null>(null);
  const [importExamId, setImportExamId] = useState<string | null>(null);
  const [importError, setImportError] = useState("");
  const [importText, setImportText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [monitorRows, setMonitorRows] = useState<ExamMonitorRow[]>([]);
  const detailRequestRunning = useRef(false);
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
  const examRowsRef = useRef<ExamCard[]>([]);
  const detailExam = examRows.find((exam) => exam.id === detailExamId);
  const importExam = examRows.find((exam) => exam.id === importExamId);

  useEffect(() => {
    examRowsRef.current = examRows;
  }, [examRows]);

  const loadExamDetail = useCallback(
    async (examId: string, options?: { silent?: boolean }) => {
      if (detailRequestRunning.current) {
        return;
      }

      detailRequestRunning.current = true;

      if (!options?.silent) {
        setDetailLoading(true);
      }

      try {
        const [detail, monitor] = await Promise.all([
          apiRequest<ExamDetailData>(`/api/exams/${examId}`),
          apiRequest<ExamMonitorRow[]>(`/api/exams/${examId}/monitor`)
        ]);

        setDetailRoster(detail.roster ?? []);
        setMonitorRows(monitor);
        const syncedExamStats = {
          participants: detail.roster?.length ?? 0,
          questionMix: {
            essay:
              detail.questions?.filter((question) => question.type === "essay")
                .length ?? 0,
            multipleChoice:
              detail.questions?.filter(
                (question) => question.type === "multiple_choice"
              ).length ?? 0,
            shortAnswer:
              detail.questions?.filter(
                (question) => question.type === "short_answer"
              ).length ?? 0
          },
          questions: detail.questions?.length ?? 0,
          submitted:
            detail.roster?.filter((row) =>
              ["submitted", "auto_submitted"].includes(row.status)
            ).length ?? 0
        } satisfies Partial<ExamCard>;

        setCreatedExams((current) =>
          current.map((exam) =>
            exam.id === examId ? { ...exam, ...syncedExamStats } : exam
          )
        );
        setEditedExams((current) => {
          const baseExam =
            current[examId] ??
            examRowsRef.current.find((exam) => exam.id === examId);

          if (!baseExam) {
            return current;
          }

          return {
            ...current,
            [examId]: {
              ...baseExam,
              ...syncedExamStats
            }
          };
        });
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Detail paket belum bisa dimuat."
        );
      } finally {
        detailRequestRunning.current = false;
        if (!options?.silent) {
          setDetailLoading(false);
        }
      }
    },
    [notify, setCreatedExams]
  );

  useEffect(() => {
    if (!detailExamId) {
      setDetailRoster([]);
      setMonitorRows([]);
      setDetailTab("participants");
      setEditingRosterId(null);
      setParticipantDraft({ name: "", nim: "" });
      setParticipantFormOpen(false);
      setRosterEditDraft({ name: "", nim: "" });
      return;
    }

    void loadExamDetail(detailExamId);
    const intervalId = window.setInterval(() => {
      void loadExamDetail(detailExamId, { silent: true });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [detailExamId, loadExamDetail]);

  useEffect(() => {
    if (detailExam?.status !== "Aktif" && detailTab === "monitor") {
      setDetailTab("participants");
    }
  }, [detailExam?.status, detailTab]);

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

    return `${origin}/?token=${encodeURIComponent(exam.token)}`;
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

  const updateExamLocally = (examId: string, updates: Partial<ExamCard>) => {
    const row = examRows.find((exam) => exam.id === examId);

    if (!row) {
      return;
    }

    if (createdExams.some((exam) => exam.id === examId)) {
      setCreatedExams((current) =>
        current.map((exam) =>
          exam.id === examId ? { ...exam, ...updates } : exam
        )
      );
    } else {
      setEditedExams((current) => ({
        ...current,
        [examId]: {
          ...(current[examId] ?? row),
          ...updates
        }
      }));
    }
  };

  const openImportParticipants = (exam: ExamCard) => {
    setImportExamId(exam.id);
    setDetailTab("participants");
    setImportError("");
    setImportText("");
    setOpenExamMenuId(null);
  };

  const readImportFile = async (file: File) => {
    setImportError("");

    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: ""
      });
      const parsedRows = rows
        .map((row) => {
          const normalized = Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key.trim().toLowerCase(),
              String(value ?? "").trim()
            ])
          );
          const nim = normalized.nim ?? normalized["nim mahasiswa"] ?? "";
          const name =
            normalized.nama ??
            normalized.name ??
            normalized["nama mahasiswa"] ??
            "";

          return nim && name ? `${nim},${name}` : "";
        })
        .filter(Boolean);

      if (parsedRows.length === 0) {
        setImportError("File belum berisi kolom NIM dan NAMA yang valid.");
        return;
      }

      setImportText(parsedRows.join("\n"));
      notify(`${parsedRows.length} baris peserta dibaca dari file Excel.`);
    } catch {
      setImportError("File Excel belum bisa dibaca. Gunakan template yang tersedia.");
    }
  };

  const importParticipants = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!importExam) {
      return;
    }

    if (!importText.trim()) {
      setImportError("Isi minimal satu baris NIM dan Nama.");
      return;
    }

    setIsImporting(true);
    setImportError("");

    try {
      const result = await apiRequest<ImportParticipantsResult>(
        `/api/exams/${importExam.id}/participants/import`,
        {
          body: JSON.stringify({ rows: importText }),
          method: "POST"
        }
      );

      updateExamLocally(importExam.id, {
        participants: result.totalParticipants
      });
      if (detailExamId === importExam.id) {
        await loadExamDetail(importExam.id, { silent: true });
      }
      notify(
        `${result.registeredParticipants} peserta baru didaftarkan ke ${importExam.name}.`
      );
      setImportExamId(null);
      setImportText("");
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Peserta belum bisa diimport."
      );
    } finally {
      setIsImporting(false);
    }
  };

  const addExamParticipant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!detailExam) {
      return;
    }

    const nim = participantDraft.nim.trim();
    const name = participantDraft.name.trim();

    if (!nim || !name) {
      notify("Lengkapi NIM dan nama peserta.");
      return;
    }

    setParticipantSaving(true);

    try {
      const result = await apiRequest<ExamParticipantMutationResult>(
        `/api/exams/${detailExam.id}/participants`,
        {
          body: JSON.stringify({
            className: "-",
            name,
            nim,
            prodi: "-"
          }),
          method: "POST"
        }
      );

      updateExamLocally(detailExam.id, {
        participants: result.totalParticipants ?? detailRoster.length + 1
      });
      await loadExamDetail(detailExam.id, { silent: true });
      setParticipantDraft({ name: "", nim: "" });
      setParticipantFormOpen(false);
      notify(`${name} berhasil ditambahkan ke paket ${detailExam.name}.`);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Peserta belum bisa ditambahkan."
      );
    } finally {
      setParticipantSaving(false);
    }
  };

  const startEditRoster = (row: ExamRosterRow) => {
    setEditingRosterId(row.id);
    setRosterEditDraft({
      name: row.participant.name,
      nim: row.participant.nim
    });
  };

  const saveRosterParticipant = async (row: ExamRosterRow) => {
    if (!detailExam) {
      return;
    }

    const nim = rosterEditDraft.nim.trim();
    const name = rosterEditDraft.name.trim();

    if (!nim || !name) {
      notify("Lengkapi NIM dan nama peserta.");
      return;
    }

    setParticipantActionId(row.id);

    try {
      await apiRequest<ExamParticipantMutationResult>(
        `/api/exams/${detailExam.id}/participants/${row.id}`,
        {
          body: JSON.stringify({ name, nim }),
          method: "PATCH"
        }
      );
      await loadExamDetail(detailExam.id, { silent: true });
      setEditingRosterId(null);
      setRosterEditDraft({ name: "", nim: "" });
      notify(`Data peserta ${name} berhasil diperbarui.`);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Data peserta belum bisa diperbarui."
      );
    } finally {
      setParticipantActionId(null);
    }
  };

  const deleteRosterParticipant = async (row: ExamRosterRow) => {
    if (!detailExam) {
      return;
    }

    if (
      !window.confirm(
        `Hapus ${row.participant.name} dari paket ${detailExam.name}?`
      )
    ) {
      return;
    }

    setParticipantActionId(row.id);

    try {
      const result = await apiRequest<DeleteExamParticipantResult>(
        `/api/exams/${detailExam.id}/participants/${row.id}`,
        { method: "DELETE" }
      );

      updateExamLocally(detailExam.id, {
        participants: result.totalParticipants
      });
      await loadExamDetail(detailExam.id, { silent: true });
      notify(`${row.participant.name} dihapus dari paket ${detailExam.name}.`);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Peserta belum bisa dihapus dari paket."
      );
    } finally {
      setParticipantActionId(null);
    }
  };

  const forceStopSession = async (row: ExamMonitorRow) => {
    if (!row.sessionId) {
      notify(`${row.name} belum memiliki sesi aktif.`);
      return;
    }

    if (
      !window.confirm(
        `Stop paksa ujian ${row.name}? Sesi akan ditutup dan jawaban yang tersimpan akan disubmit otomatis.`
      )
    ) {
      return;
    }

    setForceStoppingSessionId(row.sessionId);

    try {
      await apiRequest(`/api/exam/sessions/${row.sessionId}/force-submit`, {
        method: "POST"
      });
      notify(`Ujian ${row.name} sudah dihentikan paksa.`);
      if (detailExamId) {
        await loadExamDetail(detailExamId, { silent: true });
      }
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : `Sesi ${row.name} belum bisa dihentikan.`
      );
    } finally {
      setForceStoppingSessionId(null);
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

      setDetailTab("monitor");
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

    if (!draft.name.trim()) {
      setFormError("Nama ujian wajib diisi.");
      return;
    }

    if (duration <= 0) {
      setFormError("Durasi ujian harus lebih dari 0 menit.");
      return;
    }

    const invalidQuestionIndex = draftQuestions.findIndex(
      (question) => question.prompt.trim().length < 5
    );

    if (invalidQuestionIndex >= 0) {
      setFormError(
        `Pertanyaan ${invalidQuestionIndex + 1} wajib diisi minimal 5 karakter.`
      );
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
        token: savedExam.token,
        window: savedExam.window,
        createdById: savedExam.createdById ?? newExam.createdById,
        createdByName: savedExam.createdByName ?? newExam.createdByName,
        shuffleOptions: savedExam.shuffleOptions ?? newExam.shuffleOptions,
        shuffleQuestions: savedExam.shuffleQuestions ?? newExam.shuffleQuestions,
        violationLimit: savedExam.violationLimit ?? newExam.violationLimit
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
                Token Ujian Otomatis
                <Input
                  disabled
                  placeholder="Dibuat otomatis 4 huruf besar"
                  value={
                    draft.token
                      ? `${draft.token} - refresh tiap 10 menit saat ujian aktif`
                      : "Dibuat otomatis saat paket disimpan"
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

  if (detailExam) {
    const isImportOpen = importExamId === detailExam.id;
    const isDetailExamActive = detailExam.status === "Aktif";
    const violationLimit = detailExam.violationLimit ?? 3;

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Button
                className="mb-3 w-fit"
                type="button"
                variant="outline"
                onClick={() => {
                  setDetailExamId(null);
                  setImportExamId(null);
                  setImportError("");
                  setImportText("");
                  setParticipantFormOpen(false);
                  setEditingRosterId(null);
                }}
              >
                <ArrowLeft />
                Kembali ke Daftar Paket
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{detailExam.name}</CardTitle>
                {statusBadge(detailExam.status)}
              </div>
              <CardDescription>
                {detailExam.window} - {detailExam.duration}. Dibuat oleh{" "}
                {detailExam.createdByName ?? "Admin/Dosen"}.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => editExam(detailExam)}>
                <Settings2 />
                Edit Paket
              </Button>
              <Button
                type="button"
                variant={isDetailExamActive ? "secondary" : "outline"}
                disabled={busyExamId === detailExam.id || isDetailExamActive}
                onClick={() => startExam(detailExam)}
              >
                {isDetailExamActive ? <Radio /> : <PlayCircle />}
                {busyExamId === detailExam.id
                  ? "Memulai..."
                  : isDetailExamActive
                    ? "Ujian Sedang Berlangsung"
                    : "Mulai Ujian"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoPill label="Token" value={detailExam.token} />
              <InfoPill label="Peserta" value={`${detailExam.participants} orang`} />
              <InfoPill
                label="Submit"
                value={`${detailExam.submitted}/${detailExam.participants}`}
              />
            </div>

            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.7),inset_-2px_-2px_5px_rgba(3,105,161,0.12)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <span>
                  Link mahasiswa:{" "}
                  <a
                    className="font-black text-sky-700 underline-offset-4 hover:underline"
                    href={getExamLink(detailExam)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {getExamLink(detailExam)}
                  </a>
                </span>
                <Button
                  className="w-fit"
                  type="button"
                  variant="outline"
                  onClick={() => copyExamLink(detailExam)}
                >
                  <Copy />
                  Salin Link
                </Button>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <span>PG: {detailExam.questionMix.multipleChoice}</span>
              <span>Isian: {detailExam.questionMix.shortAnswer}</span>
              <span>Esai: {detailExam.questionMix.essay}</span>
            </div>
          </CardContent>
        </Card>

        {isImportOpen && (
          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>Import Peserta</CardTitle>
                <CardDescription>
                  Upload file Excel dari template, atau paste daftar peserta
                  dengan format NIM,Nama per baris.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline">
                  <a href="/api/templates/participants">
                    <FileSpreadsheet />
                    Download Template
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImportExamId(null);
                    setImportError("");
                    setImportText("");
                  }}
                >
                  Batal
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={importParticipants}>
                {importError && (
                  <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                    {importError}
                  </div>
                )}

                <label className="block space-y-2 text-sm font-medium">
                  File Excel Peserta
                  <Input
                    accept=".xlsx,.xls,.csv"
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        void readImportFile(file);
                      }
                    }}
                  />
                </label>

                <label className="block space-y-2 text-sm font-medium">
                  Preview / Input Manual
                  <Textarea
                    className="min-h-[180px] font-mono"
                    placeholder={"23103001,Alya Ramadhani\n23103017,Raka Pratama"}
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                  />
                </label>

                <div className="flex justify-end">
                  <Button disabled={isImporting} type="submit">
                    <Upload />
                    {isImporting ? "Mengimport..." : "Import dan Daftarkan"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <button
            className={cn(
              "rounded-2xl border p-4 text-left transition-all active:scale-[0.99]",
              detailTab === "participants"
                ? "clay-btn-primary text-white shadow-md"
                : "bg-white text-slate-700 hover:bg-slate-50"
            )}
            type="button"
            onClick={() => setDetailTab("participants")}
          >
            <div className="flex items-center gap-3">
              <UsersRound className="h-5 w-5" />
              <div>
                <p className="font-black">Mahasiswa Terdaftar</p>
                <p
                  className={cn(
                    "mt-1 text-xs font-semibold",
                    detailTab === "participants"
                      ? "text-white/80"
                      : "text-muted-foreground"
                  )}
                >
                  Kelola NIM, nama, import, tambah, edit, dan hapus peserta.
                </p>
              </div>
            </div>
          </button>
          <button
            className={cn(
              "rounded-2xl border p-4 text-left transition-all active:scale-[0.99]",
              !isDetailExamActive && "cursor-not-allowed opacity-60",
              detailTab === "monitor"
                ? "clay-btn-primary text-white shadow-md"
                : "bg-white text-slate-700 hover:bg-slate-50"
            )}
            disabled={!isDetailExamActive}
            type="button"
            onClick={() => setDetailTab("monitor")}
          >
            <div className="flex items-center gap-3">
              <Radio className="h-5 w-5" />
              <div>
                <p className="font-black">Monitoring Realtime</p>
                <p
                  className={cn(
                    "mt-1 text-xs font-semibold",
                    detailTab === "monitor"
                      ? "text-white/80"
                      : "text-muted-foreground"
                  )}
                >
                  {isDetailExamActive
                    ? "Pantau login, jawaban, pelanggaran, dan stop paksa sesi."
                    : "Aktif setelah admin/dosen klik Mulai Ujian."}
                </p>
              </div>
            </div>
          </button>
        </div>

        {detailTab === "participants" ? (
          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>Mahasiswa Terdaftar</CardTitle>
                    <Badge variant="secondary">
                      {detailRoster.length} mahasiswa
                    </Badge>
                  </div>
                  <CardDescription>
                    Daftar NIM yang boleh login ke paket ujian ini.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setParticipantFormOpen((current) => !current)
                    }
                  >
                    <Plus />
                    {participantFormOpen ? "Tutup Form" : "Tambah Peserta"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => openImportParticipants(detailExam)}
                  >
                    <Upload />
                    Import Peserta
                  </Button>
                </div>
              </div>

              {participantFormOpen && (
                <form
                  className="grid gap-3 rounded-2xl border bg-slate-50 p-3 md:grid-cols-[180px_1fr_auto]"
                  onSubmit={addExamParticipant}
                >
                  <Input
                    placeholder="NIM"
                    value={participantDraft.nim}
                    onChange={(event) =>
                      setParticipantDraft((current) => ({
                        ...current,
                        nim: event.target.value
                      }))
                    }
                  />
                  <Input
                    placeholder="Nama mahasiswa"
                    value={participantDraft.name}
                    onChange={(event) =>
                      setParticipantDraft((current) => ({
                        ...current,
                        name: event.target.value
                      }))
                    }
                  />
                  <Button disabled={participantSaving} type="submit">
                    <CheckCircle2 />
                    {participantSaving ? "Menyimpan..." : "Simpan"}
                  </Button>
                </form>
              )}
            </CardHeader>
            <CardContent>
              {detailLoading && detailRoster.length === 0 ? (
                <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-bold text-sky-800">
                  Memuat daftar mahasiswa...
                </div>
              ) : detailRoster.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-white p-5 text-sm font-semibold text-muted-foreground">
                  Belum ada mahasiswa terdaftar. Gunakan Tambah Peserta atau
                  Import Peserta untuk mendaftarkan NIM dan nama.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mahasiswa</TableHead>
                      <TableHead>NIM</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRoster.map((row) => {
                      const isEditing = editingRosterId === row.id;
                      const isBusy = participantActionId === row.id;

                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                value={rosterEditDraft.name}
                                onChange={(event) =>
                                  setRosterEditDraft((current) => ({
                                    ...current,
                                    name: event.target.value
                                  }))
                                }
                              />
                            ) : (
                              <>
                                <div className="font-semibold">
                                  {row.participant.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {row.participant.prodi} -{" "}
                                  {row.participant.className}
                                </div>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {isEditing ? (
                              <Input
                                className="font-mono"
                                value={rosterEditDraft.nim}
                                onChange={(event) =>
                                  setRosterEditDraft((current) => ({
                                    ...current,
                                    nim: event.target.value
                                  }))
                                }
                              />
                            ) : (
                              row.participant.nim
                            )}
                          </TableCell>
                          <TableCell>
                            {examParticipantStatusBadge(row.status)}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  disabled={isBusy}
                                  size="sm"
                                  type="button"
                                  onClick={() => void saveRosterParticipant(row)}
                                >
                                  <CheckCircle2 />
                                  {isBusy ? "Simpan..." : "Simpan"}
                                </Button>
                                <Button
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingRosterId(null);
                                    setRosterEditDraft({ name: "", nim: "" });
                                  }}
                                >
                                  Batal
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                  onClick={() => startEditRoster(row)}
                                >
                                  <PenLine />
                                  Edit
                                </Button>
                                <Button
                                  disabled={isBusy}
                                  size="sm"
                                  type="button"
                                  variant="destructive"
                                  onClick={() => void deleteRosterParticipant(row)}
                                >
                                  <Trash2 />
                                  {isBusy ? "Hapus..." : "Hapus"}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Monitoring Ujian Realtime</CardTitle>
                  <CardDescription>
                    Status login, progres jawaban, pelanggaran, dan kontrol sesi
                    peserta.
                  </CardDescription>
                </div>
                <Badge variant="info">
                  <Radio className="mr-1 h-3 w-3" />
                  Refresh 3 detik
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {monitorRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-white p-5 text-sm font-semibold text-muted-foreground">
                  Belum ada peserta untuk dimonitor.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mahasiswa</TableHead>
                      <TableHead>Status Login</TableHead>
                      <TableHead>Terjawab</TableHead>
                      <TableHead>Pelanggaran</TableHead>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monitorRows.map((row) => {
                      const isInProgress = row.sessionStatus === "in_progress";
                      const isForceStopping =
                        Boolean(row.sessionId) &&
                        forceStoppingSessionId === row.sessionId;

                      return (
                        <TableRow key={row.registrationId}>
                          <TableCell>
                            <div className="font-semibold">{row.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.nim} - {row.className}
                            </div>
                          </TableCell>
                          <TableCell>{monitorStatusBadge(row)}</TableCell>
                          <TableCell>
                            <div className="min-w-28">
                              <div className="mb-2 flex justify-between text-xs font-semibold">
                                <span>
                                  {row.answeredCount}/{row.questionCount}
                                </span>
                                <span>
                                  {row.questionCount
                                    ? Math.round(
                                        (row.answeredCount / row.questionCount) *
                                          100
                                      )
                                    : 0}
                                  %
                                </span>
                              </div>
                              <Progress
                                value={
                                  row.questionCount
                                    ? (row.answeredCount / row.questionCount) * 100
                                    : 0
                                }
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "font-black",
                                row.violations >= violationLimit
                                  ? "text-rose-700"
                                  : row.violations > 0
                                    ? "text-amber-700"
                                    : "text-emerald-700"
                              )}
                            >
                              {row.violations}/{violationLimit}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.sessionStartedAt
                              ? `Login ${formatShortDateTime(row.sessionStartedAt)}`
                              : "Belum login"}
                          </TableCell>
                          <TableCell>
                            <Button
                              disabled={!isInProgress || isForceStopping}
                              size="sm"
                              type="button"
                              variant={isInProgress ? "destructive" : "outline"}
                              onClick={() => void forceStopSession(row)}
                            >
                              <StopCircle />
                              {isForceStopping ? "Stop..." : "Stop Paksa"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
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
                      aria-label="Masuk detail paket"
                      onClick={() => {
                        setDetailExamId(exam.id);
                        setDetailTab("participants");
                        setImportExamId(null);
                      }}
                    >
                      <ExternalLink />
                      Masuk Paket
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Pengaturan ujian"
                      onClick={() => editExam(exam)}
                    >
                      <Settings2 />
                    </Button>
                    <Button
                      variant={exam.status === "Aktif" ? "secondary" : "outline"}
                      size="icon"
                      aria-label="Mulai ujian"
                      disabled={busyExamId === exam.id || exam.status === "Aktif"}
                      onClick={() => startExam(exam)}
                    >
                      {exam.status === "Aktif" ? <Radio /> : <PlayCircle />}
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

function UsersManagementView({
  notify,
  setUsers,
  users
}: {
  notify: (message: string) => void;
  setUsers: React.Dispatch<React.SetStateAction<ManagedUser[]>>;
  users: ManagedUser[];
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userError, setUserError] = useState("");
  const [userDraft, setUserDraft] = useState({
    email: "",
    name: "",
    password: "",
    role: "dosen" as UserRole
  });

  const updateUserDraft = (key: keyof typeof userDraft, value: string) => {
    setUserDraft((current) => ({ ...current, [key]: value }));
  };

  const saveUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserError("");

    if (!userDraft.name.trim() || !userDraft.email.trim()) {
      setUserError("Nama dan email wajib diisi.");
      return;
    }

    if (userDraft.password.length < 8) {
      setUserError("Password minimal 8 karakter.");
      return;
    }

    setIsSavingUser(true);

    try {
      const createdUser = await apiRequest<ManagedUser>("/api/users", {
        body: JSON.stringify({
          email: userDraft.email.trim(),
          name: userDraft.name.trim(),
          password: userDraft.password,
          role: userDraft.role
        }),
        method: "POST"
      });

      setUsers((current) => [createdUser, ...current]);
      setUserDraft({ email: "", name: "", password: "", role: "dosen" });
      setIsAdding(false);
      notify(`Akun ${createdUser.name} berhasil dibuat.`);
    } catch (error) {
      setUserError(
        error instanceof Error ? error.message : "Akun belum bisa dibuat."
      );
    } finally {
      setIsSavingUser(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Manajemen Pengguna</CardTitle>
            <CardDescription>
              Admin dapat membuat akun dosen. Dosen hanya akan melihat paket
              ujian yang dibuat oleh akunnya sendiri.
            </CardDescription>
          </div>
          <Button onClick={() => setIsAdding((current) => !current)}>
            <UserPlus />
            {isAdding ? "Tutup Form" : "Tambah Akun Dosen"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdding && (
            <form
              className="rounded-3xl bg-sky-50/70 p-4 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.7),inset_-2px_-2px_6px_rgba(3,105,161,0.12)]"
              onSubmit={saveUser}
            >
              {userError && (
                <div className="mb-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                  {userError}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  Nama Profil
                  <Input
                    placeholder="Nama dosen"
                    value={userDraft.name}
                    onChange={(event) =>
                      updateUserDraft("name", event.target.value)
                    }
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Email Login
                  <Input
                    placeholder="dosen@example.com"
                    type="email"
                    value={userDraft.email}
                    onChange={(event) =>
                      updateUserDraft("email", event.target.value)
                    }
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Password Awal
                  <Input
                    minLength={8}
                    placeholder="Minimal 8 karakter"
                    type="password"
                    value={userDraft.password}
                    onChange={(event) =>
                      updateUserDraft("password", event.target.value)
                    }
                  />
                </label>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Role</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["dosen", "admin"] as UserRole[]).map((role) => (
                      <button
                        key={role}
                        className={cn(
                          "h-12 rounded-2xl text-sm font-bold capitalize transition-all active:scale-95",
                          userDraft.role === role
                            ? "clay-btn-primary"
                            : "clay-btn-outline text-muted-foreground hover:text-primary"
                        )}
                        type="button"
                        onClick={() => updateUserDraft("role", role)}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button disabled={isSavingUser} type="submit">
                  <CheckCircle2 />
                  {isSavingUser ? "Menyimpan..." : "Simpan Akun"}
                </Button>
              </div>
            </form>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Dibuat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={4}
                  >
                    Belum ada data pengguna dari API.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-semibold">{item.name}</TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>
                      <Badge variant={item.role === "admin" ? "info" : "secondary"}>
                        {item.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(item.createdAt).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileView({
  currentUser,
  notify,
  onUpdated
}: {
  currentUser: AppUser;
  notify: (message: string) => void;
  onUpdated: () => void;
}) {
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileDraft, setProfileDraft] = useState({
    currentPassword: "",
    name: currentUser.name,
    newPassword: ""
  });

  useEffect(() => {
    setProfileDraft((current) => ({
      ...current,
      name: currentUser.name
    }));
  }, [currentUser.name]);

  const updateProfileDraft = (
    key: keyof typeof profileDraft,
    value: string
  ) => {
    setProfileDraft((current) => ({ ...current, [key]: value }));
  };

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError("");

    if (!profileDraft.name.trim()) {
      setProfileError("Nama profil wajib diisi.");
      return;
    }

    if (profileDraft.newPassword && profileDraft.newPassword.length < 8) {
      setProfileError("Password baru minimal 8 karakter.");
      return;
    }

    if (profileDraft.newPassword && !profileDraft.currentPassword) {
      setProfileError("Isi password lama untuk mengganti password.");
      return;
    }

    setIsSavingProfile(true);

    try {
      await apiRequest("/api/profile", {
        body: JSON.stringify({
          currentPassword: profileDraft.currentPassword || undefined,
          name: profileDraft.name.trim(),
          newPassword: profileDraft.newPassword || undefined
        }),
        method: "PATCH"
      });

      setProfileDraft((current) => ({
        ...current,
        currentPassword: "",
        newPassword: ""
      }));
      onUpdated();
      notify("Profil berhasil diperbarui.");
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Profil belum bisa diperbarui."
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>Profil Pengguna</CardTitle>
          <CardDescription>
            Ubah nama profil yang tampil di dashboard dan ganti password akun.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveProfile}>
            {profileError && (
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {profileError}
              </div>
            )}
            <label className="space-y-2 text-sm font-medium">
              Nama Profil
              <Input
                value={profileDraft.name}
                onChange={(event) =>
                  updateProfileDraft("name", event.target.value)
                }
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                Password Lama
                <Input
                  autoComplete="current-password"
                  type="password"
                  value={profileDraft.currentPassword}
                  onChange={(event) =>
                    updateProfileDraft("currentPassword", event.target.value)
                  }
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Password Baru
                <Input
                  autoComplete="new-password"
                  minLength={8}
                  type="password"
                  value={profileDraft.newPassword}
                  onChange={(event) =>
                    updateProfileDraft("newPassword", event.target.value)
                  }
                />
              </label>
            </div>
            <div className="flex justify-end">
              <Button disabled={isSavingProfile} type="submit">
                <KeyRound />
                {isSavingProfile ? "Menyimpan..." : "Simpan Profil"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Info Akun</CardTitle>
          <CardDescription>
            Role menentukan akses paket dan menu di dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoPill label="Nama" value={currentUser.name} />
          <InfoPill label="Role" value={currentUser.role} />
          <InfoPill label="Hak akses" value={currentUser.title} />
        </CardContent>
      </Card>
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
  const [exportLoading, setExportLoading] = useState(false);
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

  const downloadExamResults = async () => {
    if (!selectedExam) {
      return;
    }

    setExportLoading(true);

    try {
      const response = await fetch(`/api/grading/${selectedExam.id}/export`, {
        credentials: "include"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<never>;
        throw new Error(payload.error ?? "File hasil ujian belum bisa dibuat.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename =
        filenameMatch?.[1] ?? `hasil-ujian-${selectedExam.token}.xlsx`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notify(`File hasil ujian ${selectedExam.name} diunduh.`);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "File hasil ujian belum bisa diunduh."
      );
    } finally {
      setExportLoading(false);
    }
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
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setSelectedExamId(null)}
            >
              <ArrowLeft />
              Kembali ke Paket
            </Button>
            <Button
              disabled={exportLoading}
              size="sm"
              type="button"
              variant="outline"
              onClick={downloadExamResults}
            >
              <Download />
              {exportLoading ? "Menyiapkan..." : "Download Hasil"}
            </Button>
          </div>
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
                disabled={exportLoading}
                type="button"
                variant="outline"
                onClick={downloadExamResults}
              >
                <Download />
                {exportLoading ? "Menyiapkan..." : "Download Hasil"}
              </Button>
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
