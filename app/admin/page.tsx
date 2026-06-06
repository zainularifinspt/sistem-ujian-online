import HomeClient, { type View } from "@/components/home-client";

type AdminPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

const views = [
  "dashboard",
  "exams",
  "participants",
  "grading",
  "analytics",
  "users",
  "profile"
] satisfies View[];

function getInitialView(view?: string): View {
  return views.includes(view as View) ? (view as View) : "dashboard";
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;

  return <HomeClient initialView={getInitialView(params?.view)} />;
}
