"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  KeyRound,
  RotateCcw,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Search,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { MathContent } from "@/components/math-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/components/home-client";

type QuestionOption = {
  id: string;
  text: string;
  imageUrl?: string | null;
};

type RegradeQuestion = {
  id: string;
  order: number;
  type: "multiple_choice" | "short_answer" | "essay";
  prompt: string;
  imageUrl: string | null;
  options: QuestionOption[] | null;
  answerKey: string | null;
  score: number;
};

type RegradeGetResponse = {
  questions: RegradeQuestion[];
  submittedSessionsCount: number;
};

type RegradePostResponse = {
  success: boolean;
  updatedQuestionsCount: number;
  regradedSessionsCount: number;
};

export default function RegradeModal({
  examId,
  examName,
  isOpen,
  onClose,
  onSuccess,
  notify
}: {
  examId: string;
  examName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  notify: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [questions, setQuestions] = useState<RegradeQuestion[]>([]);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [editedKeys, setEditedKeys] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<
    "all" | "multiple_choice" | "short_answer" | "changed"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Load questions when modal opens
  useEffect(() => {
    if (!isOpen || !examId) return;

    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const res = await apiRequest<RegradeGetResponse>(
          `/api/exams/${examId}/regrade`
        );
        if (!isMounted) return;
        setQuestions(res.questions);
        setSubmittedCount(res.submittedSessionsCount);
        setEditedKeys({});
      } catch (err) {
        if (!isMounted) return;
        notify(
          err instanceof Error
            ? err.message
            : "Gagal memuat butir soal untuk koreksi kunci."
        );
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [examId, isOpen, notify]);

  const changedCount = Object.keys(editedKeys).length;

  const handleKeyChange = (questionId: string, newKey: string) => {
    const original = questions.find((q) => q.id === questionId);
    if (!original) return;

    if ((original.answerKey ?? "").trim() === newKey.trim()) {
      setEditedKeys((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    } else {
      setEditedKeys((prev) => ({
        ...prev,
        [questionId]: newKey
      }));
    }
  };

  const handleResetKey = (questionId: string) => {
    setEditedKeys((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      // Filter by category
      if (activeFilter === "multiple_choice" && q.type !== "multiple_choice") {
        return false;
      }
      if (activeFilter === "short_answer" && q.type !== "short_answer") {
        return false;
      }
      if (activeFilter === "changed" && !editedKeys[q.id]) {
        return false;
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesPrompt = q.prompt.toLowerCase().includes(query);
        const matchesOrder = `soal ${q.order}`.includes(query);
        return matchesPrompt || matchesOrder;
      }

      return true;
    });
  }, [questions, activeFilter, editedKeys, searchQuery]);

  const handleSaveAndRegrade = async () => {
    if (submitting) return;

    setSubmitting(true);
    try {
      const updates = Object.entries(editedKeys).map(
        ([questionId, answerKey]) => ({
          questionId,
          answerKey
        })
      );

      const res = await apiRequest<RegradePostResponse>(
        `/api/exams/${examId}/regrade`,
        {
          method: "POST",
          body: JSON.stringify({
            updates,
            regrade: true
          })
        }
      );

      notify(
        `Kunci jawaban berhasil diperbarui dan nilai ${res.regradedSessionsCount} peserta berhasil dihitung ulang!`
      );
      onSuccess();
      onClose();
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menghitung ulang nilai."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        <motion.div
          animate={{ scale: 1, opacity: 1 }}
          className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
          exit={{ scale: 0.95, opacity: 0 }}
          initial={{ scale: 0.95, opacity: 0 }}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-slate-100 bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 text-white">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center p-1.5 rounded-lg bg-white/20">
                  <KeyRound className="w-5 h-5" />
                </span>
                <h2 className="text-xl font-bold tracking-tight">
                  Kunci Jawaban & Hitung Ulang (Re-grade)
                </h2>
              </div>
              <p className="text-sm text-white/80">
                Paket: <span className="font-semibold text-white">{examName}</span>{" "}
                • {submittedCount} mahasiswa sudah submit
              </p>
            </div>
            <button
              className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              type="button"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Info Banner */}
          <div className="px-6 py-3 bg-amber-50/80 border-b border-amber-200/60 text-amber-900 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Aman:</strong> Mengganti kunci di sini tidak akan menghapus
              lembar jawaban mahasiswa. Nilai Pilihan Ganda & Isian Singkat akan
              dikalkulasi ulang secara otomatis. Nilai esai manual tidak akan
              terganggu.
            </span>
          </div>

          {/* Controls: Search & Filter Tabs */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                className="rounded-xl text-xs h-8"
                size="sm"
                variant={activeFilter === "all" ? "default" : "outline"}
                onClick={() => setActiveFilter("all")}
              >
                Semua ({questions.length})
              </Button>
              <Button
                className="rounded-xl text-xs h-8"
                size="sm"
                variant={
                  activeFilter === "multiple_choice" ? "default" : "outline"
                }
                onClick={() => setActiveFilter("multiple_choice")}
              >
                Pilihan Ganda (
                {questions.filter((q) => q.type === "multiple_choice").length})
              </Button>
              <Button
                className="rounded-xl text-xs h-8"
                size="sm"
                variant={activeFilter === "short_answer" ? "default" : "outline"}
                onClick={() => setActiveFilter("short_answer")}
              >
                Isian Singkat (
                {questions.filter((q) => q.type === "short_answer").length})
              </Button>
              {changedCount > 0 && (
                <Button
                  className="rounded-xl text-xs h-8 bg-amber-500 hover:bg-amber-600 text-white"
                  size="sm"
                  variant="default"
                  onClick={() => setActiveFilter("changed")}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  Diubah ({changedCount})
                </Button>
              )}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <Input
                className="pl-8 h-8 text-xs rounded-xl bg-white"
                placeholder="Cari nomor / teks soal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Content Body: Question list */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <p className="text-sm font-medium">Memuat butir soal...</p>
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="text-center py-16 text-slate-400 space-y-2">
                <p className="text-sm font-semibold">
                  Tidak ada butir soal yang sesuai filter.
                </p>
              </div>
            ) : (
              filteredQuestions.map((question) => {
                const currentKey =
                  editedKeys[question.id] !== undefined
                    ? editedKeys[question.id]
                    : question.answerKey ?? "";
                const isChanged = editedKeys[question.id] !== undefined;

                return (
                  <div
                    key={question.id}
                    className={`rounded-2xl border transition-all p-5 ${
                      isChanged
                        ? "border-amber-400/80 bg-amber-50/30 shadow-sm ring-1 ring-amber-300"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    {/* Question Header */}
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm">
                          Soal #{question.order}
                        </span>
                        <Badge
                          variant={
                            question.type === "multiple_choice"
                              ? "default"
                              : question.type === "short_answer"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {question.type === "multiple_choice"
                            ? "Pilihan Ganda"
                            : question.type === "short_answer"
                            ? "Isian Singkat"
                            : "Esai"}
                        </Badge>
                        <span className="text-xs text-slate-400">
                          {question.score} Poin
                        </span>
                      </div>

                      {isChanged && (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            <Sparkles className="w-3 h-3" /> Kunci Diubah
                          </span>
                          <Button
                            className="h-7 text-xs px-2 text-slate-600 hover:text-slate-900"
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() => handleResetKey(question.id)}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Reset
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Question Prompt */}
                    <div className="text-sm text-slate-700 leading-relaxed mb-4">
                      <MathContent text={question.prompt} />
                      {question.imageUrl && (
                        <div className="relative mt-3 aspect-video max-w-md overflow-hidden rounded-xl bg-slate-100">
                          <Image
                            fill
                            unoptimized
                            alt={`Gambar soal ${question.order}`}
                            className="object-contain"
                            src={question.imageUrl}
                          />
                        </div>
                      )}
                    </div>

                    {/* Question Answer Key Config */}
                    {question.type === "multiple_choice" ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Pilih Kunci Jawaban yang Benar:
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {(question.options ?? []).map((option, optIdx) => {
                            const optLabel = String.fromCharCode(65 + optIdx); // A, B, C, D, E...
                            const isSelected = currentKey === option.id;

                            return (
                              <button
                                key={option.id}
                                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                                  isSelected
                                    ? "border-emerald-600 bg-emerald-50/80 text-emerald-950 ring-1 ring-emerald-500 shadow-sm"
                                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                                }`}
                                type="button"
                                onClick={() =>
                                  handleKeyChange(question.id, option.id)
                                }
                              >
                                <div
                                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-bold text-xs ${
                                    isSelected
                                      ? "bg-emerald-600 text-white"
                                      : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {isSelected ? (
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  ) : (
                                    optLabel
                                  )}
                                </div>
                                <div className="text-xs leading-5 flex-1">
                                  {option.text && (
                                    <MathContent text={option.text} />
                                  )}
                                  {option.imageUrl && (
                                    <div className="relative mt-1 h-16 w-24 overflow-hidden rounded border bg-slate-50">
                                      <Image
                                        fill
                                        unoptimized
                                        alt={`Opsi ${optLabel}`}
                                        className="object-contain"
                                        src={option.imageUrl}
                                      />
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : question.type === "short_answer" ? (
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Teks / Formula Kunci Jawaban:
                        </label>
                        <div className="flex gap-2">
                          <Input
                            className={`text-sm rounded-xl ${
                              isChanged
                                ? "border-amber-400 bg-amber-50/50 font-medium"
                                : "bg-slate-50/50"
                            }`}
                            placeholder="Contoh: Jakarta atau 3NF atau \(x = 2\)"
                            value={currentKey}
                            onChange={(e) =>
                              handleKeyChange(question.id, e.target.value)
                            }
                          />
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Kunci awal:{" "}
                          <span className="font-mono font-medium text-slate-600">
                            {question.answerKey || "(Kosong)"}
                          </span>
                          . Saat dihitung ulang, jawaban peserta akan dicocokkan
                          persis dan dievaluasi maknanya oleh AI.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs text-slate-500">
                        Soal esai dinilai secara kualitatif oleh pengajar pada
                        menu Penilaian Mahasiswa. Nilai esai yang sudah diberikan
                        tidak akan ditimpa saat proses hitung ulang.
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              {changedCount > 0 ? (
                <span className="font-semibold text-amber-700">
                  ⚡ {changedCount} kunci jawaban diubah dan siap dihitung
                  ulang.
                </span>
              ) : (
                <span>
                  Belum ada kunci jawaban yang diubah. Anda juga bisa langsung
                  menjalankan hitung ulang jika diperlukan.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                className="rounded-xl"
                disabled={submitting}
                type="button"
                variant="outline"
                onClick={onClose}
              >
                Batal
              </Button>
              <Button
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex-1 sm:flex-none shadow-md shadow-emerald-600/20"
                disabled={submitting || loading}
                type="button"
                onClick={handleSaveAndRegrade}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Menghitung Ulang Nilai...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Simpan Kunci & Hitung Ulang
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
