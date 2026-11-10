import { Suspense } from "react";
import { CampaignsHub } from "@/components/campaigns/CampaignsHub";

export default function CampaignsPage() {
  return (
    <Suspense>
      <CampaignsHub />
    </Suspense>
  );
}
