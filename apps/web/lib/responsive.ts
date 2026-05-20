"use client";

import { Grid } from "antd";

export function useBreakpoint() {
  return Grid.useBreakpoint();
}

export function useIsMobile() {
  const screens = Grid.useBreakpoint();
  return !screens.md;
}
