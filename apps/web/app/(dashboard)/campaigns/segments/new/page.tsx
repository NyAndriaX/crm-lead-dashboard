import { Suspense } from "react";
import { SegmentEditor } from "@/components/campaigns/SegmentEditor";

export default function NewSegmentPage() {
  return (
    <Suspense>
      <SegmentEditor />
    </Suspense>
  );
}
