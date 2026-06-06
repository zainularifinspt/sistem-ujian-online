import StudentExamClient from "@/components/student-exam-client";

type StudentExamPageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

export default async function StudentExamPage({
  searchParams
}: StudentExamPageProps) {
  const params = await searchParams;

  return <StudentExamClient initialToken={params?.token ?? ""} />;
}
