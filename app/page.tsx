import StudentExamClient from "@/components/student-exam-client";

type HomePageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;

  return <StudentExamClient initialToken={params?.token ?? ""} />;
}
