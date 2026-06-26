import HomeClient, { type View } from "@/components/home-client";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

type AdminPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

const views = [
  "dashboard",
  "exams",
  "grading",
  "analytics",
  "users",
  "profile"
] as const;

type AdminView = (typeof views)[number];

function getInitialView(view?: string): View {
  return views.includes(view as AdminView) ? (view as View) : "dashboard";
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const session = await auth.api.getSession({
    headers: await headers()
  });

  const serializedSession = session
    ? {
        session: {
          ...session.session,
          createdAt: session.session.createdAt?.toISOString(),
          updatedAt: session.session.updatedAt?.toISOString(),
          expiresAt: session.session.expiresAt?.toISOString(),
        },
        user: {
          ...session.user,
          createdAt: session.user.createdAt?.toISOString(),
          updatedAt: session.user.updatedAt?.toISOString(),
        },
      }
    : null;

  return (
    <HomeClient
      initialView={getInitialView(params?.view)}
      initialSession={serializedSession}
    />
  );
}
