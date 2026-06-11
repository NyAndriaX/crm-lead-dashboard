import { DataScopeError, type DataScope } from "@crm/db";
import { ApiError } from "./api";
import type { AccessClaims } from "./auth";

export function toScope(session: AccessClaims): DataScope {
  return { userId: session.sub, role: session.role };
}

export function scopeError(e: unknown): never {
  if (e instanceof DataScopeError) {
    const status = e.code === "forbidden" ? 403 : 404;
    throw new ApiError(status, e.message, e.code);
  }
  throw e;
}
