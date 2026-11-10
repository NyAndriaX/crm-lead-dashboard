import { Suspense } from "react";
import { SegmentEditor } from "@/components/campaigns/SegmentEditor";

export default async function SegmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <SegmentEditor segmentId={id} />
    </Suspense>
  );
}
