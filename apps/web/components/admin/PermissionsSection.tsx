"use client";

/**
 * Section Permissions / Rôles — matrice RBAC éditable (persistée en base).
 */
import { useCallback, useEffect, useState } from "react";
import {
  Alert, Button, Card, message, Space, Switch, Table, Tag, Typography,
} from "antd";
import { ReloadOutlined, SaveOutlined, LockOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";

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

const ROLES: Role[] = ["ADMIN", "MANAGER", "COMMERCIAL", "LECTEUR"];

type Matrix = Record<Role, string[]>;

type Row = {
  key: string;
  label: string;
  group: string;
};

function matrixToRows(matrix: Matrix): Record<string, Record<Role, boolean>> {
  const out: Record<string, Record<Role, boolean>> = {};
  for (const p of PERMISSIONS) {
    out[p.key] = {
      ADMIN: matrix.ADMIN.includes(p.key),
      MANAGER: matrix.MANAGER.includes(p.key),
      COMMERCIAL: matrix.COMMERCIAL.includes(p.key),
      LECTEUR: matrix.LECTEUR.includes(p.key),
    };
  }
  return out;
}

function rowsToMatrix(checked: Record<string, Record<Role, boolean>>): Matrix {
  const matrix: Matrix = { ADMIN: [], MANAGER: [], COMMERCIAL: [], LECTEUR: [] };
  for (const role of ROLES) {
    matrix[role] = PERMISSIONS.filter((p) => checked[p.key]?.[role]).map((p) => p.key);
  }
  return matrix;
}

export function PermissionsSection() {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [checked, setChecked] = useState<Record<string, Record<Role, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: { matrix: Matrix } }>("/rbac/matrix");
      const m = data.data.matrix;
      setMatrix(m);
      setChecked(matrixToRows(m));
      setDirty(false);
    } catch {
      message.error("Impossible de charger la matrice des permissions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function toggle(permKey: string, role: Role, value: boolean) {
    if (role === "ADMIN") return;
    setChecked((prev) => {
      const row = prev[permKey] ?? { ADMIN: true, MANAGER: false, COMMERCIAL: false, LECTEUR: false };
      return {
        ...prev,
        [permKey]: { ...row, [role]: value },
      };
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = rowsToMatrix(checked);
      const { data } = await api.put<{ data: { matrix: Matrix } }>("/rbac/matrix", { matrix: payload });
      setMatrix(data.data.matrix);
      setChecked(matrixToRows(data.data.matrix));
      setDirty(false);
      message.success("Matrice des permissions enregistrée.");
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(msg ?? "Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    void load();
  }

  const tableRows: Row[] = PERMISSIONS.map((p) => ({ key: p.key, label: p.label, group: p.group }));

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
      width: 130,
      render: (v) => <Tag>{v}</Tag>,
    },
    ...ROLES.map((role): ColumnsType<Row>[number] => ({
      title: (
        <Space size={4}>
          <Tag color={ROLE_COLORS[role]} style={{ margin: 0 }}>{ROLE_LABELS[role]}</Tag>
          {role === "ADMIN" && <LockOutlined style={{ color: "#999", fontSize: 12 }} />}
        </Space>
      ),
      key: role,
      align: "center" as const,
      width: 120,
      render: (_, r) => (
        <Switch
          size="small"
          checked={checked[r.key]?.[role] ?? false}
          disabled={role === "ADMIN"}
          onChange={(v) => toggle(r.key, role, v)}
        />
      ),
    })),
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <Title level={5} style={{ marginTop: 0 }}>Matrice des rôles et permissions</Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Modifiez les accès de chaque rôle de base. Les changements sont appliqués immédiatement
              sur toutes les routes API. Pour changer le rôle d&apos;un utilisateur, allez dans{" "}
              <Text strong>Utilisateurs</Text>.
            </Paragraph>
          </div>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={resetDefaults} disabled={loading || saving}>
              Réinitialiser
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!dirty || loading}
              onClick={() => void save()}
            >
              Enregistrer
            </Button>
          </Space>
        </div>
      </Card>

      <Alert
        type="info"
        showIcon
        message="Rôle Administrateur"
        description={
          <>
            Le rôle <Text strong>ADMIN</Text> conserve toujours toutes les permissions (non modifiable)
            pour éviter de bloquer l&apos;accès à la configuration.
          </>
        }
      />

      <Table
        rowKey="key"
        columns={columns}
        dataSource={tableRows}
        loading={loading}
        pagination={false}
        size="middle"
        scroll={{ x: 900 }}
      />

      {matrix && dirty && (
        <Alert type="warning" showIcon message="Modifications non enregistrées — cliquez sur Enregistrer pour appliquer." />
      )}
    </Space>
  );
}
