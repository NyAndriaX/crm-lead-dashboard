/**
 * POST /api/oauth/microsoft/save
 * Microsoft 365 OAuth setup is disabled pending validation.
 */
import { ApiError, handler, requirePermission } from "@/lib/api";

export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  await requirePermission("settings:manage");
  throw new ApiError(
    410,
    "Microsoft 365 OAuth configuration is temporarily disabled pending validation.",
    "microsoft_oauth_disabled",
  );
});
