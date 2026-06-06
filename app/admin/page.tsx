import HomeClient, { type View } from "@/components/home-client";

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

  return <HomeClient initialView={getInitialView(params?.view)} />;
}
