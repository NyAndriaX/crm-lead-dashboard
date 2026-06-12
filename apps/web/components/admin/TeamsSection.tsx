"use client";

/**
 * Section Équipes (U-03) — gestion des équipes commerciales depuis Paramètres.
 *
 * - Liste les équipes avec leur nombre de membres
 * - Créer / renommer / supprimer une équipe
 * - Drawer "Membres" : sélection multi des users à inclure dans l'équipe
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Drawer, Form, Input, List, Modal, Popconfirm, Select, Space, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, TeamOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { PAGE_CARD_STYLE } from "@/lib/pageUi";
import { notifyApiError, notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback";

const { Text, Title } = Typography;

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

type TeamRow = {
  id: string;
  name: string;
  memberCount: number;
  members: Member[];
  createdAt: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  teamId: string | null;
};

export function TeamsSection() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<TeamRow | null>(null);
  const [membersTarget, setMembersTarget] = useState<TeamRow | null>(null);
  const [createForm] = Form.useForm();
  const [renameForm] = Form.useForm();
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [t, u] = await Promise.all([
        api.get<{ data: TeamRow[] }>("/teams"),
        api.get<{ data: UserRow[] }>("/users?all=true"),
      ]);
      setTeams(t.data.data);
      setUsers(u.data.data);
    } catch (e) { notifyApiError(e, "Impossible de charger les équipes."); } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  async function createTeam() {
    const values = await createForm.validateFields();
    setSaving(true);
    try {
      await api.post("/teams", values);
      notifySuccess("Équipe créée");
      createForm.resetFields();
      setCreateOpen(false);
      void fetchAll();
    } catch (e) { notifyApiError(e, "Erreur"); } finally {
      setSaving(false);
    }
  }

  async function renameTeam() {
    if (!renameTarget) return;
    const values = await renameForm.validateFields();
    setSaving(true);
    try {
      await api.put(`/teams/${renameTarget.id}`, values);
      notifySuccess("Équipe renommée");
      setRenameTarget(null);
      void fetchAll();
    } catch (e) { notifyApiError(e, "Erreur"); } finally {
      setSaving(false);
    }
  }

  async function deleteTeam(team: TeamRow) {
    try {
      await api.delete(`/teams/${team.id}`);
      notifySuccess(`Équipe « ${team.name} » supprimée`);
      void fetchAll();
    } catch (e) { notifyApiError(e, "Erreur"); }
  }

  function openMembers(team: TeamRow) {
    setMembersTarget(team);
    setSelectedMemberIds(team.members.map((m) => m.id));
  }

  async function saveMembers() {
    if (!membersTarget) return;
    setSaving(true);
    try {
      await api.put(`/teams/${membersTarget.id}/members`, { userIds: selectedMemberIds });
      notifySuccess("Membres mis à jour");
      setMembersTarget(null);
      void fetchAll();
    } catch (e) { notifyApiError(e, "Erreur"); } finally {
      setSaving(false);
    }
  }

  const availableUsers = useMemo(() => users.filter((u) => u.isActive), [users]);

  const totalMembers = teams.reduce((acc, t) => acc + t.memberCount, 0);
  const unassigned = users.filter((u) => u.isActive && !u.teamId).length;

  const columns: ColumnsType<TeamRow> = [
    {
      title: "Équipe",
      key: "name",
      render: (_, r) => (
        <Space>
          <TeamOutlined style={{ color: "#1677ff" }} />
          <Text strong>{r.name}</Text>
        </Space>
      ),
    },
    {
      title: "Membres actifs",
      dataIndex: "memberCount",
      key: "memberCount",
      width: 140,
      render: (v: number) => <Tag color={v > 0 ? "blue" : "default"}>{v} membre{v > 1 ? "s" : ""}</Tag>,
    },
    {
      title: "Créée le",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 130,
      responsive: ["md"],
      render: (v) =>
        new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }),
    },
    {
      title: "",
      key: "actions",
      width: 160,
      render: (_, r) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<UserAddOutlined />}
            onClick={() => openMembers(r)}
          >
            Membres
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setRenameTarget(r);
              renameForm.setFieldsValue({ name: r.name });
            }}
          />
          <Popconfirm
            title={`Supprimer « ${r.name} » ?`}
            description="Les membres seront détachés (pas supprimés)."
            onConfirm={() => void deleteTeam(r)}
            okText="Supprimer"
            cancelText="Annuler"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small" style={PAGE_CARD_STYLE}>
        <div className="page-toolbar">
          <Space size={32} wrap>
            <Statistic title="Équipes" value={teams.length} valueStyle={{ fontSize: 20 }} />
            <Statistic title="Total membres" value={totalMembers} valueStyle={{ fontSize: 20, color: "#1677ff" }} />
            <Statistic title="Non assignés" value={unassigned} valueStyle={{ fontSize: 20, color: "#fa8c16" }} />
          </Space>
          <div className="page-toolbar-actions">
            <Button icon={<ReloadOutlined />} onClick={() => fetchAll()}>Actualiser</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Nouvelle équipe
            </Button>
          </div>
        </div>
      </Card>

      <Card style={PAGE_CARD_STYLE}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={teams}
          loading={loading}
          size="middle"
          pagination={{ pageSize: 10, showTotal: (t) => `${t} équipe(s)` }}
        />
      </Card>

      {/* Création */}
      <Modal
        title={<Space><TeamOutlined /><span>Nouvelle équipe</span></Space>}
        open={createOpen}
        onOk={() => void createTeam()}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        confirmLoading={saving}
        okText="Créer"
        cancelText="Annuler"
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Nom de l'équipe"
            rules={[{ required: true, message: "Nom requis" }, { max: 80 }]}
          >
            <Input placeholder="ex. Équipe Île-de-France" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Renommer */}
      <Modal
        title="Renommer l'équipe"
        open={!!renameTarget}
        onOk={() => void renameTeam()}
        onCancel={() => setRenameTarget(null)}
        confirmLoading={saving}
        okText="Enregistrer"
        cancelText="Annuler"
      >
        <Form form={renameForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nom" rules={[{ required: true, max: 80 }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Membres */}
      <Drawer
        title={<Space><TeamOutlined /><span>Membres de « {membersTarget?.name} »</span></Space>}
        open={!!membersTarget}
        onClose={() => setMembersTarget(null)}
        width={520}
        extra={
          <Space>
            <Button onClick={() => setMembersTarget(null)}>Annuler</Button>
            <Button type="primary" onClick={() => void saveMembers()} loading={saving}>
              Enregistrer
            </Button>
          </Space>
        }
      >
        <Title level={5} style={{ marginTop: 0 }}>Sélection des membres</Title>
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          Cochez les utilisateurs qui doivent appartenir à cette équipe. Le retrait détache
          simplement l'utilisateur (il ne le supprime pas).
        </Text>
        <Select
          mode="multiple"
          style={{ width: "100%", marginBottom: 24 }}
          placeholder="Rechercher un utilisateur…"
          value={selectedMemberIds}
          onChange={setSelectedMemberIds}
          options={availableUsers.map((u) => ({
            value: u.id,
            label: `${u.name} — ${u.email}${u.teamId && u.teamId !== membersTarget?.id ? " (autre équipe)" : ""}`,
          }))}
          filterOption={(input, option) =>
            String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())
          }
        />
        {selectedMemberIds.length > 0 && (
          <List
            size="small"
            header={<Text strong>{selectedMemberIds.length} membre(s) sélectionné(s)</Text>}
            dataSource={users.filter((u) => selectedMemberIds.includes(u.id))}
            renderItem={(u) => (
              <List.Item>
                <List.Item.Meta
                  title={u.name}
                  description={u.email}
                />
                <Tag>{u.role}</Tag>
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </Space>
  );
}
