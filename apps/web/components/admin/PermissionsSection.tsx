"use client";

/**
 * Section Permissions / Rôles (U-02) — affichage en lecture seule de la matrice
 * RBAC actuelle (4 rôles × ~17 permissions).
 *
 * La matrice est définie en dur dans `lib/rbac.ts` (côté serveur). Cet affichage
 * mirroir aide les admins à comprendre exactement ce qu'autorise chaque rôle
 * avant d'affecter un user.
 */
import { Card, Space, Table, Tag, Typography, Alert } from "antd";
import { CheckCircleFilled, MinusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

const { Title, Text, Paragraph } = Typography;

type Role = "ADMIN" | "MANAGER" | "COMMERCIAL" | "LECTEUR";

const ROLE_COLORS: Record<Role, string> = {
  ADMIN: "red",
  MANAGER: "purple",
  COMMERCIAL: "blue",
  LECTEUR: "default",
};

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  COMMERCIAL: "Commercial",
  LECTEUR: "Lecteur",
};

// Miroir UI de la matrice définie dans lib/rbac.ts (à garder synchronisé).
const PERMISSIONS: { key: string; label: string; group: string }[] = [
  { key: "leads:read", label: "Lire les leads", group: "Leads" },
  { key: "leads:write", label: "Créer / modifier des leads", group: "Leads" },
  { key: "leads:delete", label: "Supprimer des leads", group: "Leads" },
  { key: "leads:assign", label: "Assigner des leads", group: "Leads" },
  { key: "import:run", label: "Lancer un import", group: "Import" },
  { key: "campaigns:read", label: "Lire les campagnes", group: "Emailing" },
  { key: "campaigns:write", label: "Créer / modifier les campagnes", group: "Emailing" },
  { key: "campaigns:send", label: "Envoyer une campagne", group: "Emailing" },
  { key: "inbox:read", label: "Consulter l'inbox", group: "Réponses" },
  { key: "inbox:reply", label: "Répondre depuis l'inbox", group: "Réponses" },
  { key: "sequences:manage", label: "Gérer les séquences de relance", group: "Relances" },
  { key: "pipeline:manage", label: "Gérer le pipeline", group: "Pipeline" },
  { key: "analytics:read", label: "Consulter les analytics", group: "Analytics" },
  { key: "users:manage", label: "Gérer les utilisateurs", group: "Administration" },
  { key: "settings:manage", label: "Modifier les paramètres", group: "Administration" },
  { key: "rgpd:manage", label: "Actions RGPD", group: "Administration" },
];

const MATRIX: Record<Role, Set<string>> = {
  ADMIN: new Set(PERMISSIONS.map((p) => p.key)),
  MANAGER: new Set([
    "leads:read", "leads:write", "leads:delete", "leads:assign",
    "import:run",
    "campaigns:read", "campaigns:write", "campaigns:send",
    "inbox:read", "inbox:reply",
    "sequences:manage", "pipeline:manage", "analytics:read",
  ]),
  COMMERCIAL: new Set([
    "leads:read", "leads:write",
    "campaigns:read",
    "inbox:read", "inbox:reply",
    "pipeline:manage", "analytics:read",
  ]),
  LECTEUR: new Set(["leads:read", "campaigns:read", "inbox:read", "analytics:read"]),
};

const ROLES: Role[] = ["ADMIN", "MANAGER", "COMMERCIAL", "LECTEUR"];

type Row = {
  key: string;
  label: string;
  group: string;
  ADMIN: boolean;
  MANAGER: boolean;
  COMMERCIAL: boolean;
  LECTEUR: boolean;
};

export function PermissionsSection() {
  const rows: Row[] = PERMISSIONS.map((p) => ({
    key: p.key,
    label: p.label,
    group: p.group,
    ADMIN: MATRIX.ADMIN.has(p.key),
    MANAGER: MATRIX.MANAGER.has(p.key),
    COMMERCIAL: MATRIX.COMMERCIAL.has(p.key),
    LECTEUR: MATRIX.LECTEUR.has(p.key),
  }));

  const columns: ColumnsType<Row> = [
    {
      title: "Permission",
      key: "label",
      fixed: "left",
      width: 280,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.label}</Text>
          <Text type="secondary" code style={{ fontSize: 11 }}>{r.key}</Text>
        </Space>
      ),
    },
    {
      title: "Module",
      dataIndex: "group",
      key: "group",
      width: 140,
      render: (v) => <Tag>{v}</Tag>,
    },
    ...ROLES.map((role): ColumnsType<Row>[number] => ({
      title: <Tag color={ROLE_COLORS[role]} style={{ margin: 0 }}>{ROLE_LABELS[role]}</Tag>,
      key: role,
      align: "center",
      width: 110,
      render: (_, r) =>
        r[role] ? (
          <CheckCircleFilled style={{ color: "#52c41a", fontSize: 18 }} />
        ) : (
          <MinusOutlined style={{ color: "#bfbfbf", fontSize: 14 }} />
        ),
    })),
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <Title level={5} style={{ marginTop: 0 }}>Matrice des rôles et permissions</Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Vue en lecture seule des permissions accordées par chaque rôle. La matrice est définie
          dans <Text code>lib/rbac.ts</Text> et appliquée côté serveur sur chaque route API.
          Pour changer le rôle d'un utilisateur, allez dans l'onglet <Text strong>Utilisateurs</Text>.
        </Paragraph>
      </Card>

      <Alert
        type="info"
        showIcon
        message="Logique d'héritage"
        description={
          <>
            <Text strong>ADMIN</Text> a toutes les permissions ·{" "}
            <Text strong>MANAGER</Text> a tout sauf l'administration ·{" "}
            <Text strong>COMMERCIAL</Text> opère sur les leads + campagnes en lecture ·{" "}
            <Text strong>LECTEUR</Text> n'a que des accès en lecture.
          </>
        }
      />

      <Table
        rowKey="key"
        columns={columns}
        dataSource={rows}
        pagination={false}
        size="middle"
        scroll={{ x: 800 }}
        rowClassName={(_, idx) => (idx % 2 === 0 ? "ant-table-row-striped" : "")}
      />
    </Space>
  );
}
