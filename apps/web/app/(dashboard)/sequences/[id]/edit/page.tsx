import { SequenceBuilder } from "@/components/sequences/SequenceBuilder";

export default async function EditSequencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SequenceBuilder sequenceId={id} />;
}
