"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { PenLine, ArrowLeft, Download, Search, CheckCircle2, Clock3, KeyRound, FileSpreadsheet, Loader2 } from "lucide-react";

import { MathContent } from "@/components/math-content";
import RegradeModal from "@/components/views/regrade-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  type GradingStudent,
  type ExamCard,
  type EssayReview,
  type ApiEnvelope,
  apiRequest,
  statusBadge
} from "@/components/home-client";

export default function GradingView({
  exams,
  notify,
  setApiExams
}: {
  exams: ExamCard[];
  notify: (message: string) => void;
  setApiExams?: React.Dispatch<React.SetStateAction<ExamCard[]>>;
}) {
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [selectedStudentNim, setSelectedStudentNim] = useState("");
  const [gradingMode, setGradingMode] = useState<"list" | "detail">("list");
  const [gradingLoading, setGradingLoading] = useState(false);
  const [gradingSearch, setGradingSearch] = useState("");
  const [gradingStudents, setGradingStudents] = useState<GradingStudent[]>([]);
  const [exportLoading, setExportLoading] = useState<"summary" | "raw" | null>(null);
  const [detailTab, setDetailTab] = useState<"essay" | "review">("essay");
  const [showRegradeModal, setShowRegradeModal] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const gradingCacheRef = useRef<Map<string, GradingStudent[]>>(new Map());
  const selectedExam = exams.find((exam) => exam.id === selectedExamId);
  const selectedStudent =
    gradingStudents.find((student) => student.nim === selectedStudentNim) ??
    gradingStudents[0];
  const filteredGradingStudents = gradingStudents.filter((student) =>
    `${student.nim} ${student.name} ${student.prodi}`
      .toLowerCase()
      .includes(gradingSearch.toLowerCase())
  );
  const totalPureEssayCount = gradingStudents.reduce(
    (total, student) =>
      total + student.essays.filter((e) => e.type === "essay").length,
    0
  );
  const gradedPureEssayCount = gradingStudents.reduce(
    (total, student) =>
      total +
      student.essays.filter(
        (essay) => essay.type === "essay" && essay.score !== null
      ).length,
    0
  );
  const studentsNeedPureEssayReview = gradingStudents.filter((student) =>
    student.essays.some((essay) => essay.type === "essay" && essay.score === null)
  ).length;

  const hasPureEssays = totalPureEssayCount > 0;

  const gradingProgress = totalPureEssayCount
    ? Math.round((gradedPureEssayCount / totalPureEssayCount) * 100)
    : 100;

  const averageScore = Math.round(
    gradingStudents.reduce(
      (total, student) => total + calculateStudentScore(student).earned,
      0
    ) / Math.max(gradingStudents.length, 1)
  );

  const averageMcScore = Math.round(
    gradingStudents.reduce((total, student) => total + student.mcScore, 0) /
      Math.max(gradingStudents.length, 1)
  );

  const averageShortScore = Math.round(
    gradingStudents.reduce(
      (total, student) => total + calculateStudentScore(student).shortEarned,
      0
    ) / Math.max(gradingStudents.length, 1)
  );

  const prefetchExamGrading = useCallback((examId: string) => {
    if (gradingCacheRef.current.has(examId)) {
      return;
    }
    void apiRequest<GradingStudent[]>(`/api/grading/${examId}`)
      .then((rows) => {
        gradingCacheRef.current.set(examId, rows);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Background prefetch first 3 exams so clicking them is 0ms instant
    const timer = setTimeout(() => {
      for (const exam of exams.slice(0, 3)) {
        prefetchExamGrading(exam.id);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [exams, prefetchExamGrading]);

  useEffect(() => {
    let isMounted = true;

    async function loadGradingStudents() {
      if (!selectedExamId) {
        setGradingStudents([]);
        setSelectedStudentNim("");
        return;
      }

      // If cached and not explicit refresh, show cached data instantly (0ms)
      const cached = gradingCacheRef.current.get(selectedExamId);
      if (cached && refreshIndex === 0) {
        setGradingStudents(cached);
        setSelectedStudentNim((prev) => prev || (cached[0]?.nim ?? ""));
      } else {
        setGradingLoading(true);
      }

      try {
        const rows = await apiRequest<GradingStudent[]>(
          `/api/grading/${selectedExamId}`,
          { forceRefresh: refreshIndex > 0 }
        );

        if (!isMounted) {
          return;
        }

        gradingCacheRef.current.set(selectedExamId, rows);
        setGradingStudents(rows);
        setSelectedStudentNim((prev) => {
          if (prev && rows.some((r) => r.nim === prev)) {
            return prev;
          }
          return rows[0]?.nim ?? "";
        });
      } catch (error) {
        if (isMounted) {
          if (!cached) {
            setGradingStudents([]);
            setSelectedStudentNim("");
          }
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
  }, [notify, selectedExamId, refreshIndex]);

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

  const saveStudentScore = async () => {
    if (!selectedStudent || !selectedExam) {
      return;
    }

    const missingScores = selectedStudent.essays.filter(
      (essay) => essay.type === "essay" && essay.score === null
    ).length;

    if (missingScores > 0) {
      notify(
        `${selectedStudent.name} masih punya ${missingScores} esai belum diberi skor.`
      );
      return;
    }

    try {
      await apiRequest(`/api/grading/${selectedExam.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nim: selectedStudent.nim,
          scores: selectedStudent.essays.map((essay) => ({
            questionId: essay.id,
            score: essay.score
          }))
        })
      });

      gradingCacheRef.current.set(selectedExam.id, gradingStudents);

      if (setApiExams) {
        setApiExams((examsList) =>
          examsList.map((exam) => {
            if (exam.id === selectedExam.id) {
              return {
                ...exam,
                needsGrading: Math.max(0, (exam.needsGrading ?? 0) - 1)
              };
            }
            return exam;
          })
        );
      }

      notify(`Nilai ${selectedStudent.name} tersimpan.`);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Gagal menyimpan nilai."
      );
    }
  };

  const openNextUngraded = () => {
    const nextStudent =
      gradingStudents.find(
        (student) =>
          student.nim !== selectedStudent?.nim &&
          student.essays.some((essay) => essay.type === "essay" && essay.score === null)
      ) ??
      gradingStudents.find((student) =>
        student.essays.some((essay) => essay.type === "essay" && essay.score === null)
      );

    if (nextStudent) {
      setSelectedStudentNim(nextStudent.nim);
      notify(`Membuka jawaban ${nextStudent.name} yang belum selesai dinilai.`);
      return;
    }

    notify("Semua jawaban esai pada paket ini sudah dinilai.");
  };

  const downloadExamResults = async (type: "summary" | "raw" = "summary") => {
    if (!selectedExam) {
      return;
    }

    setExportLoading(type);

    try {
      const response = await fetch(
        `/api/grading/${selectedExam.id}/export?type=${type}`,
        {
          credentials: "include"
        }
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<never>;
        throw new Error(payload.error ?? "File hasil ujian belum bisa dibuat.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename =
        filenameMatch?.[1] ??
        (type === "raw"
          ? `jawaban-mentah-dan-kunci-${selectedExam.token}.xlsx`
          : `hasil-ujian-${selectedExam.token}.xlsx`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notify(
        type === "raw"
          ? `Data mentah jawaban & kunci ${selectedExam.name} berhasil diunduh.`
          : `Rekap hasil ujian ${selectedExam.name} berhasil diunduh.`
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "File hasil ujian belum bisa diunduh."
      );
    } finally {
      setExportLoading(null);
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
          {exams.map((exam, index) => {
            const colors = [
              {
                border: "border-l-4 border-l-emerald-500",
                bg: "bg-emerald-50/40 hover:bg-emerald-50/60",
              },
              {
                border: "border-l-4 border-l-sky-500",
                bg: "bg-sky-50/40 hover:bg-sky-50/60",
              },
              {
                border: "border-l-4 border-l-indigo-500",
                bg: "bg-indigo-50/40 hover:bg-indigo-50/60",
              },
              {
                border: "border-l-4 border-l-rose-500",
                bg: "bg-rose-50/40 hover:bg-rose-50/60",
              },
              {
                border: "border-l-4 border-l-amber-500",
                bg: "bg-amber-50/40 hover:bg-amber-50/60",
              }
            ];
            const color = colors[index % colors.length];

            return (
              <div
                key={exam.id}
                onMouseEnter={() => prefetchExamGrading(exam.id)}
                className={`rounded-2xl border border-slate-200/80 p-5 shadow-sm transition-all duration-300 ${color.border} ${color.bg}`}
              >
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
                    onMouseEnter={() => prefetchExamGrading(exam.id)}
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
                    value={`${exam.needsGrading ?? 0} mahasiswa`}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  }

  if (gradingLoading) {
    return (
      <Card className="border-sky-200 bg-sky-50/20 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-4 py-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <div>
            <CardTitle className="text-lg text-slate-800">Memuat Penilaian...</CardTitle>
            <CardDescription className="text-sm text-slate-500">
              Menyiapkan data roster, jawaban, dan skor dari API penilaian.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (!selectedStudent) {
    return (
      <>
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
              {selectedExam && (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setShowRegradeModal(true)}
                >
                  <KeyRound />
                  Kunci Jawaban & Hitung Ulang
                </Button>
              )}
              <Button
                disabled={exportLoading !== null}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => downloadExamResults("summary")}
              >
                <Download />
                {exportLoading === "summary" ? "Menyiapkan..." : "Download Rekap Nilai"}
              </Button>
              <Button
                disabled={exportLoading !== null}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => downloadExamResults("raw")}
              >
                <FileSpreadsheet />
                {exportLoading === "raw" ? "Menyiapkan..." : "Download Jawaban Mentah & Kunci"}
              </Button>
            </div>
            <CardTitle>Belum Ada Data Penilaian</CardTitle>
            <CardDescription>
              Paket ini belum memiliki peserta dengan sesi/jawaban yang bisa
              dinilai.
            </CardDescription>
          </CardHeader>
        </Card>

        {selectedExam && (
          <RegradeModal
            examId={selectedExam.id}
            examName={selectedExam.name}
            isOpen={showRegradeModal}
            notify={notify}
            onClose={() => setShowRegradeModal(false)}
            onSuccess={() => setRefreshIndex((prev) => prev + 1)}
          />
        )}
      </>
    );
  }

  const selectedScore = calculateStudentScore(selectedStudent);
  const selectedUngradedEssays = selectedStudent
    ? selectedStudent.essays.filter(
        (essay) => essay.type === "essay" && essay.score === null
      ).length
    : 0;

  if (gradingMode === "detail") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setGradingMode("list")}
                >
                  <ArrowLeft />
                  Kembali ke Daftar
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setShowRegradeModal(true)}
                >
                  <KeyRound />
                  Kunci Jawaban & Hitung Ulang
                </Button>
              </div>
              <p className="text-xs font-semibold uppercase text-primary">
                Penilaian / Detail Mahasiswa
              </p>
              <CardTitle>{selectedStudent.name}</CardTitle>
              <CardDescription>
                {[selectedExam.name, selectedStudent.nim, selectedStudent.prodi]
                  .filter((v) => v && v !== "-")
                  .join(" - ")}
              </CardDescription>
            </div>
            {hasPureEssays && selectedUngradedEssays ? (
              <Badge variant="warning">
                {selectedUngradedEssays} esai belum dinilai
              </Badge>
            ) : (
              <Badge variant="success">Selesai dinilai</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoPill
                label="Skor PG"
                value={`${selectedStudent.mcScore}/${selectedStudent.mcMax}`}
              />
              <InfoPill
                label="Skor Isian"
                value={`${selectedScore.shortEarned}/${selectedScore.shortMax}`}
              />
              <InfoPill
                label={hasPureEssays && selectedUngradedEssays ? "Total sementara" : "Total akhir"}
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
                <span>Isian: {selectedScore.shortEarned} poin</span>
                {hasPureEssays && <span>Esai: {selectedScore.essayEarned} poin</span>}
              </div>
            </div>

            <div className="flex border-b border-slate-200">
              {hasPureEssays && (
                <button
                  className={`border-b-2 px-4 py-2.5 text-sm font-bold transition-all ${
                    detailTab === "essay"
                      ? "border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-xl"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                  type="button"
                  onClick={() => setDetailTab("essay")}
                >
                  Penilaian Esai Manual
                </button>
              )}
              <button
                className={`border-b-2 px-4 py-2.5 text-sm font-bold transition-all ${
                  detailTab === "review"
                    ? "border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-xl"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
                type="button"
                onClick={() => setDetailTab("review")}
              >
                Review Semua Jawaban
              </button>
            </div>

            {detailTab === "essay" && hasPureEssays ? (
              <>
                <div>
                  <h3 className="text-sm font-semibold">Penilaian Jawaban Esai</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Baca jawaban mahasiswa, isi skor, lalu simpan nilai.
                  </p>
                </div>

                {selectedStudent.essays.filter(e => e.type === "essay").map((essay, index) => (
                  <div key={essay.id} className="space-y-3 rounded-md border bg-white p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          Soal {index + 1} - maksimal {essay.maxScore} poin
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          <MathContent text={essay.question} />
                        </p>
                        {essay.imageUrl && (
                          <div className="relative mt-3 aspect-video max-w-2xl overflow-hidden rounded-md bg-slate-100">
                            <Image
                              fill
                              unoptimized
                              alt={`Gambar esai ${index + 1}`}
                              className="object-contain"
                              src={essay.imageUrl}
                            />
                          </div>
                        )}
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
                        {essay.answerFormat === "math" ? (
                          <MathContent text={essay.answer} />
                        ) : (
                          essay.answer
                        )}
                      </p>
                    </div>

                    <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                      <span className="font-semibold">Rubrik: </span>
                      {essay.rubric}
                    </div>

                    <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                      <label className="space-y-2 text-sm font-medium">
                        Skor Jawaban
                        <Input
                          max={essay.maxScore}
                          min={0}
                          step="any"
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
                                      Math.max(0, parseFloat(value) || 0)
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
              </>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Review Lembar Jawaban</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Berikut adalah rincian jawaban mahasiswa per nomor soal dibandingkan dengan kunci jawaban resmi.
                  </p>
                </div>

                {selectedStudent.answersDetail && selectedStudent.answersDetail.length > 0 ? (
                  selectedStudent.answersDetail.map((detail, index) => {
                    const isMc = detail.type === "multiple_choice";
                    const isShort = detail.type === "short_answer";
                    const isEssay = detail.type === "essay";

                    return (
                      <div key={detail.questionId} className="rounded-2xl border bg-white p-5 space-y-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                          <span className="text-sm font-bold text-slate-800">
                            Soal {index + 1}
                          </span>
                          <div className="flex gap-2">
                            <Badge variant="secondary">
                              {isMc ? "Pilihan Ganda" : isShort ? "Isian Singkat" : "Esai"}
                            </Badge>
                            {detail.type !== "essay" && (
                              detail.isCorrect ? (
                                <Badge variant="success">Benar (+{detail.score ?? 1})</Badge>
                              ) : (
                                <Badge variant="destructive">Salah (+0)</Badge>
                              )
                            )}
                            {detail.type === "essay" && (
                              <Badge variant={detail.score !== null ? "success" : "warning"}>
                                Skor: {detail.score !== null ? detail.score : "-"}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <MathContent
                          className="mt-2 block text-sm font-bold leading-6 text-slate-900"
                          text={detail.prompt}
                        />
                        {detail.imageUrl && (
                          <div className="relative mt-3 aspect-video overflow-hidden rounded-2xl bg-slate-100">
                            <Image
                              fill
                              unoptimized
                              alt={`Gambar soal ${index + 1}`}
                              className="object-contain"
                              src={detail.imageUrl}
                            />
                          </div>
                        )}

                        {isMc && detail.options && (
                          <div className="mt-3 grid gap-2">
                            {detail.options.map((opt, oIdx) => {
                              const isStudentChoice = detail.studentAnswer === opt.id;
                              const isCorrectAnswer = detail.correctKey === opt.id;
                              
                              let optionStyle = "bg-slate-50 border border-slate-200 text-slate-700";
                              let badgeStyle = "bg-slate-200 text-slate-800";

                              if (isCorrectAnswer) {
                                optionStyle = "bg-emerald-50 border-2 border-emerald-500 text-emerald-950 font-bold";
                                badgeStyle = "bg-emerald-500 text-white";
                              } else if (isStudentChoice && !detail.isCorrect) {
                                optionStyle = "bg-rose-50 border-2 border-rose-500 text-rose-950 font-bold";
                                badgeStyle = "bg-rose-500 text-white";
                              }

                              return (
                                <div key={opt.id} className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm transition-all ${optionStyle}`}>
                                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${badgeStyle}`}>
                                    {String.fromCharCode(65 + oIdx)}
                                  </span>
                                  <div className="min-w-0 flex-1 space-y-2">
                                    {opt.imageUrl && (
                                      <div className="relative aspect-video max-w-lg overflow-hidden rounded-xl bg-white/70">
                                        <Image
                                          fill
                                          unoptimized
                                          alt={`Gambar pilihan ${String.fromCharCode(65 + oIdx)}`}
                                          className="object-contain"
                                          src={opt.imageUrl}
                                        />
                                      </div>
                                    )}
                                    {opt.text && <MathContent className="block" text={opt.text} />}
                                    <div className="flex flex-wrap gap-2">
                                      {isCorrectAnswer && (
                                        <span className="text-xs font-bold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full">Kunci Jawaban</span>
                                      )}
                                      {isStudentChoice && !isCorrectAnswer && (
                                        <span className="text-xs font-bold text-rose-600 bg-rose-100/80 px-2 py-0.5 rounded-full">Pilihan Peserta (Salah)</span>
                                      )}
                                      {isStudentChoice && isCorrectAnswer && (
                                        <span className="text-xs font-bold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full">Pilihan Peserta (Benar)</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {isShort && (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border bg-slate-50 p-4">
                              <p className="text-xs font-extrabold uppercase text-slate-400">Jawaban Peserta</p>
                              <p className={`mt-1.5 text-sm font-bold ${detail.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {detail.studentAnswer ? (
                                  detail.answerFormat === "math" ? (
                                    <MathContent text={detail.studentAnswer} />
                                  ) : (
                                    detail.studentAnswer
                                  )
                                ) : (
                                  "- (Kosong)"
                                )}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                              <p className="text-xs font-extrabold uppercase text-emerald-600">Kunci Jawaban</p>
                              <p className="mt-1.5 text-sm font-bold text-emerald-950">
                                {detail.correctKey ? (
                                  detail.answerFormat === "math" ? (
                                    <MathContent text={detail.correctKey} />
                                  ) : (
                                    detail.correctKey
                                  )
                                ) : (
                                  "-"
                                )}
                              </p>
                            </div>
                          </div>
                        )}

                        {isEssay && (
                          <div className="mt-3 space-y-3">
                            <div className="rounded-2xl border bg-slate-50 p-4">
                              <p className="text-xs font-extrabold uppercase text-slate-400">Jawaban Esai Peserta</p>
                              <p className="mt-1.5 text-sm whitespace-pre-wrap font-medium text-slate-800">
                                {detail.studentAnswer || "- (Kosong)"}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Detail lembar jawaban belum tersedia.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-xl">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge className="border-white/20 bg-white/15 text-white">
                Penilaian / Paket Ujian
              </Badge>
              <h2 className="mt-5 text-3xl font-semibold md:text-4xl">
                Daftar Koreksi & Nilai Mahasiswa
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/85 md:text-base">
                {selectedExam.name} - Token {selectedExam.token}. Pilih mahasiswa
                pada tabel untuk membuka halaman rincian lembar jawaban.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                type="button"
                variant="outline"
                onClick={() => setShowRegradeModal(true)}
              >
                <KeyRound />
                Kunci Jawaban & Hitung Ulang
              </Button>
              <Button
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                disabled={exportLoading !== null}
                type="button"
                variant="outline"
                onClick={() => downloadExamResults("summary")}
              >
                <Download />
                {exportLoading === "summary" ? "Menyiapkan..." : "Download Rekap Nilai"}
              </Button>
              <Button
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                disabled={exportLoading !== null}
                type="button"
                variant="outline"
                onClick={() => downloadExamResults("raw")}
              >
                <FileSpreadsheet />
                {exportLoading === "raw" ? "Menyiapkan..." : "Download Jawaban Mentah & Kunci"}
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

        {hasPureEssays ? (
          <>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Perlu koreksi esai</p>
                <p className="mt-2 text-3xl font-semibold">{studentsNeedPureEssayReview}</p>
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
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Rata-rata Skor PG</p>
                <p className="mt-2 text-3xl font-semibold">
                  {averageMcScore}
                  <span className="text-base font-normal text-muted-foreground">
                    /{gradingStudents[0]?.mcMax || 0}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pilihan ganda otomatis
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Rata-rata Skor Isian</p>
                <p className="mt-2 text-3xl font-semibold">
                  {averageShortScore}
                  <span className="text-base font-normal text-muted-foreground">
                    /{calculateStudentScore(gradingStudents[0] || { essays: [], mcMax: 0, mcScore: 0, autoShortMax: 0, autoShortScore: 0, kelas: '', name: '', nim: '', prodi: '', submittedAt: '', answersDetail: [] }).shortMax || 0}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Isian singkat (AI/Kunci)
                </p>
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Rata-rata Nilai Akhir</p>
            <p className="mt-2 text-3xl font-semibold">{averageScore}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Total rata-rata seluruh siswa
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
                Cari mahasiswa, lihat rincian skor PG & isian, lalu buka detail lembar jawaban.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cari nama, NIM, atau prodi"
              value={gradingSearch}
              onChange={(event) => setGradingSearch(event.target.value)}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mahasiswa</TableHead>
                <TableHead>NIM</TableHead>
                <TableHead>Skor PG</TableHead>
                <TableHead>Skor Isian</TableHead>
                {hasPureEssays && <TableHead>Skor Esai</TableHead>}
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
                    colSpan={hasPureEssays ? 8 : 7}
                  >
                    Tidak ada mahasiswa yang cocok dengan pencarian.
                  </TableCell>
                </TableRow>
              ) : (
                filteredGradingStudents.map((student) => {
                  const score = calculateStudentScore(student);
                  const missingPureEssays = student.essays.filter(
                    (essay) => essay.type === "essay" && essay.score === null
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
                            {student.prodi && student.prodi !== "-" && (
                              <p className="text-xs text-muted-foreground">
                                {student.prodi}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{student.nim}</TableCell>
                      <TableCell className="font-semibold">
                        {student.mcScore}/{student.mcMax}
                      </TableCell>
                      <TableCell className="font-semibold text-sky-700">
                        {score.shortEarned}/{score.shortMax}
                      </TableCell>
                      {hasPureEssays && (
                        <TableCell className="font-semibold text-purple-700">
                          {score.essayEarned}/{score.essayMax}
                        </TableCell>
                      )}
                      <TableCell className="font-bold text-slate-900">
                        {score.earned}/{score.max}
                      </TableCell>
                      <TableCell>
                        {hasPureEssays && missingPureEssays ? (
                          <Badge variant="warning">Belum {missingPureEssays}</Badge>
                        ) : (
                          <Badge variant="success">Selesai</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedStudentNim(student.nim);
                            setGradingMode("detail");
                            setDetailTab(hasPureEssays ? "essay" : "review");
                            notify(`Masuk halaman detail jawaban ${student.name}.`);
                          }}
                        >
                          <Search />
                          Detail Jawaban
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

      {selectedExam && (
        <RegradeModal
          examId={selectedExam.id}
          examName={selectedExam.name}
          isOpen={showRegradeModal}
          notify={notify}
          onClose={() => setShowRegradeModal(false)}
          onSuccess={() => setRefreshIndex((prev) => prev + 1)}
        />
      )}
    </div>
  );
}

function calculateStudentScore(student: GradingStudent) {
  const pureEssays = student.essays.filter((e) => e.type === "essay" || (!e.type && e.rubric.includes("Nilai berdasarkan")));
  const shortAnswers = student.essays.filter((e) => e.type === "short_answer" || (!e.type && !e.rubric.includes("Nilai berdasarkan")));

  const essayEarned = pureEssays.reduce(
    (total, essay) => total + (essay.score ?? 0),
    0
  );
  const essayMax = pureEssays.reduce(
    (total, essay) => total + essay.maxScore,
    0
  );

  const shortEarned = shortAnswers.length > 0
    ? shortAnswers.reduce((total, sa) => total + (sa.score ?? 0), 0)
    : student.autoShortScore;
  const shortMax = shortAnswers.length > 0
    ? shortAnswers.reduce((total, sa) => total + sa.maxScore, 0)
    : student.autoShortMax;

  const earned = student.mcScore + shortEarned + essayEarned;
  const max = student.mcMax + shortMax + essayMax;

  return {
    earned,
    essayEarned,
    essayMax,
    shortEarned,
    shortMax,
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

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
