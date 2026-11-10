import { SequenceDetail } from "@/components/sequences/SequenceDetail";

export default async function SequencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SequenceDetail sequenceId={id} />;
}
