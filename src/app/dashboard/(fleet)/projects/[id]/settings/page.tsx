import { ProjectSettings } from "@/components/studio/ProjectSettings";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectSettings key={id} projectId={id} />;
}
