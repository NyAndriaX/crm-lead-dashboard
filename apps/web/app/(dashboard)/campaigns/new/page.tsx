import { Suspense } from "react";
import { CampaignWizard } from "@/components/campaigns/CampaignWizard";

export default function NewCampaignPage() {
  return (
    <Suspense>
      <CampaignWizard />
    </Suspense>
  );
}
