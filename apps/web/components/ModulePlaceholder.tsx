"use client";

import { Result, Typography } from "antd";

const { Paragraph } = Typography;

// Page d'attente pour les modules pas encore implémentés (cf. docs/BACKLOG.md).
export default function ModulePlaceholder({ title, tickets }: { title: string; tickets: string }) {
  return (
    <Result
      status="info"
      title={title}
      subTitle={`Module à implémenter — tickets ${tickets}.`}
      extra={<Paragraph type="secondary">Le socle (auth, RBAC, API, Leads) est en place ; ce module arrive dans un prochain lot.</Paragraph>}
    />
  );
}
