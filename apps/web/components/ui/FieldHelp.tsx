"use client";

import { Tooltip } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

/** Icône « ? » avec infobulle explicative pour les champs de formulaire. */
export function FieldHelp({ children }: { children: ReactNode }) {
  return (
    <Tooltip
      title={<div style={{ maxWidth: 340, fontSize: 13, lineHeight: 1.5 }}>{children}</div>}
      placement="topLeft"
    >
      <QuestionCircleOutlined
        style={{ marginLeft: 6, color: "#8c8c8c", cursor: "help", fontSize: 13 }}
        aria-label="Aide"
      />
    </Tooltip>
  );
}

export function labelWithHelp(label: string, help: ReactNode): ReactNode {
  return (
    <span>
      {label}
      <FieldHelp>{help}</FieldHelp>
    </span>
  );
}
