"use client";

import React, { useState } from "react";
import { UserPlus, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  type ManagedUser,
  type UserRole,
  apiRequest
} from "@/components/home-client";

export default function UsersManagementView({
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
