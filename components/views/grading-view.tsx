"use client";

import React, { useState, useEffect } from "react";
import { PenLine, ArrowLeft, Download, Search, CheckCircle2, Clock3 } from "lucide-react";

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
  const [exportLoading, setExportLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"essay" | "review">("essay");
  const selectedExam = exams.find((exam) => exam.id === selectedExamId);
  const selectedStudent =
    gradingStudents.find((student) => student.nim === selectedStudentNim) ??
    gradingStudents[0];
  const filteredGradingStudents = gradingStudents.filter((student) =>
    `${student.nim} ${student.name} ${student.prodi}`
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

  const saveStudentScore = async () => {
    if (!selectedStudent || !selectedExam) {
      return;
    }

    const missingScores = selectedStudent.essays.filter(
      (essay) => essay.score === null
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
                {selectedStudent.prodi}
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

            <div className="flex border-b border-slate-200">
              <button
                className={`border-b-2 px-4 py-2.5 text-sm font-bold transition-all ${
                  detailTab === "essay"
                    ? "border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-xl"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
                type="button"
                onClick={() => setDetailTab("essay")}
              >
                Penilaian Esai
              </button>
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

            {detailTab === "essay" ? (
              <>
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
                                <Badge variant="success">Benar (+1)</Badge>
                              ) : (
                                <Badge variant="destructive">Salah (+0)</Badge>
                              )
                            )}
                            {detail.type === "essay" && (
                              <Badge variant={detail.score !== null ? "success" : "warning"}>
                                Skor: {detail.score !== null ? detail.score : "-"} / 1
                              </Badge>
                            )}
                          </div>
                        </div>

                        <p className="text-sm font-bold leading-6 text-slate-900 mt-2">
                          {detail.prompt}
                        </p>

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
                                <div key={opt.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-all ${optionStyle}`}>
                                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${badgeStyle}`}>
                                    {String.fromCharCode(65 + oIdx)}
                                  </span>
                                  <span className="flex-1">{opt.text}</span>
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
                              );
                            })}
                          </div>
                        )}

                        {isShort && (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border bg-slate-50 p-4">
                              <p className="text-xs font-extrabold uppercase text-slate-400">Jawaban Peserta</p>
                              <p className={`mt-1.5 text-sm font-bold ${detail.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {detail.studentAnswer || "- (Kosong)"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                              <p className="text-xs font-extrabold uppercase text-emerald-600">Kunci Jawaban</p>
                              <p className="mt-1.5 text-sm font-bold text-emerald-950">
                                {detail.correctKey || "-"}
                              </p>
                            </div>
                          </div>
                        )}

                        {isEssay && (
                          <div className="mt-3 space-y-2">
                            <div className="rounded-2xl border bg-slate-50 p-4">
                              <p className="text-xs font-extrabold uppercase text-slate-400">Jawaban Peserta</p>
                              <p className="mt-1.5 text-sm leading-6 text-slate-900">
                                {detail.studentAnswer || "Belum ada jawaban esai tersimpan."}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
                    Tidak ada rincian jawaban yang dapat ditampilkan.
                  </div>
                )}
              </div>
            )}
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
                    colSpan={7}
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

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
