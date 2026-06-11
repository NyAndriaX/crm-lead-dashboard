"use client";

import { RocketFilled } from "@ant-design/icons";
import { Space, Typography } from "antd";
import { useSiteBranding } from "@/lib/useSiteBranding";

const { Text } = Typography;

type Props = {
  iconSize?: number;
  nameSize?: number;
  /** light = texte blanc (panneau login gauche), dark = texte standard */
  variant?: "light" | "dark";
  /** vertical-center = logo au-dessus du nom (mobile login) */
  layout?: "horizontal" | "vertical-center";
  showName?: boolean;
};

export function SiteBrandLogo({
  iconSize = 44,
  nameSize = 18,
  variant = "light",
  layout = "horizontal",
  showName = true,
}: Props) {
  const { siteName, siteIconUrl } = useSiteBranding();

  const iconBox = (
    <div
      style={{
        width: iconSize,
        height: iconSize,
        borderRadius: layout === "vertical-center" ? 14 : 12,
        background: siteIconUrl
          ? "transparent"
          : layout === "vertical-center"
            ? "linear-gradient(135deg,#1d39c4,#1677ff)"
            : "rgba(255,255,255,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: siteIconUrl ? "none" : "1px solid rgba(255,255,255,0.25)",
        backdropFilter: siteIconUrl ? undefined : "blur(8px)",
        boxShadow: layout === "vertical-center" ? "0 8px 24px rgba(22,119,255,0.25)" : undefined,
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {siteIconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={siteIconUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <RocketFilled
          style={{
            fontSize: iconSize * 0.5,
            color: variant === "light" || layout === "vertical-center" ? "#fff" : "#1677ff",
          }}
        />
      )}
    </div>
  );

  const nameEl = showName ? (
    <Text
      strong={layout === "vertical-center"}
      style={{
        color: variant === "light" ? "#fff" : undefined,
        fontSize: layout === "vertical-center" ? nameSize + 4 : nameSize,
        fontWeight: 700,
        letterSpacing: layout === "vertical-center" ? undefined : -0.3,
      }}
    >
      {siteName}
    </Text>
  ) : null;

  if (layout === "vertical-center") {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "inline-flex", marginBottom: showName ? 12 : 0 }}>{iconBox}</div>
        {nameEl}
      </div>
    );
  }

  return (
    <Space size={12} align="center">
      {iconBox}
      {showName ? <div>{nameEl}</div> : null}
    </Space>
  );
}
