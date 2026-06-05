import HomeClient, { type View } from "@/components/home-client";

type PageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

const views = [
  "dashboard",
  "exams",
  "participants",
  "grading",
  "analytics"
] satisfies View[];

function getInitialView(view?: string): View {
  return views.includes(view as View) ? (view as View) : "dashboard";
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;

  return <HomeClient initialView={getInitialView(params?.view)} />;
}
