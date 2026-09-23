import { CrewForms } from "@/components/CrewForms";

export default async function NewCrew({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="max-w-3xl mx-auto">
      <div className="tag mb-4">CREW_SETUP</div>
      <h1 className="font-sans font-bold text-4xl mb-10">Another crew.</h1>
      <CrewForms error={error} />
    </div>
  );
}
