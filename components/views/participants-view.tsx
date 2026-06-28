"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, RefreshCcw, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  type ParticipantRow,
  type ApiParticipant,
  apiRequest,
  mapApiParticipantToRow,
  statusBadge
} from "@/components/home-client";

export default function ParticipantsView({
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
            <AnimatePresence>
              {isAdding && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <form
                    className="grid gap-3 rounded-md border bg-slate-50 p-3 md:grid-cols-4 mb-4"
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
                </motion.div>
              )}
            </AnimatePresence>
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
