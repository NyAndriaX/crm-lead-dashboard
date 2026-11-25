"use client";

/**
 * Modification des informations d'un lead (fiche 360°) — panneau latéral, pas de modale :
 * formulaire de plusieurs champs. Envoie seulement les champs modifiés (PUT /api/leads/:id).
 */
import { useEffect, useState } from "react";
import { Button, Col, Drawer, Form, Grid, Input, Row, Space, message } from "antd";
import { api } from "@/lib/client";

export type LeadEditable = {
  id: string;
  firstName: string | null; lastName: string | null; email: string | null; phone: string | null;
  company: string | null; website: string | null; sector: string | null; city: string | null; country: string | null;
  source: string | null; notes: string | null;
};

const FIELDS = ["firstName", "lastName", "email", "phone", "company", "website", "sector", "city", "country", "source", "notes"] as const;
type Field = (typeof FIELDS)[number];

export function LeadEditDrawer({
  lead, open, onClose, onSaved,
}: { lead: LeadEditable; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<Record<Field, string | undefined>>();
  const [saving, setSaving] = useState(false);
  const screens = Grid.useBreakpoint();

  useEffect(() => {
    if (open) form.setFieldsValue(Object.fromEntries(FIELDS.map((f) => [f, lead[f] ?? undefined])));
  }, [open, lead, form]);

  const save = async () => {
    const values = await form.validateFields();
    // Seuls les champs changés ; une case vidée devient null (effacement).
    const patch: Partial<Record<Field, string | null>> = {};
    for (const f of FIELDS) {
      const v = values[f]?.trim() ? values[f]!.trim() : null;
      if (v !== (lead[f] ?? null)) patch[f] = v;
    }
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setSaving(true);
    try {
      await api.put(`/leads/${lead.id}`, patch);
      message.success("Lead mis à jour");
      onSaved();
      onClose();
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Mise à jour impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title="Modifier le lead"
      open={open}
      onClose={onClose}
      width={screens.md ? 560 : "100%"}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Annuler</Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>Enregistrer</Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item name="firstName" label="Prénom"><Input placeholder="Jean" /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="lastName" label="Nom"><Input placeholder="Dupont" /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Email invalide" }]}>
              <Input placeholder="jean.dupont@entreprise.com" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}><Form.Item name="phone" label="Téléphone"><Input placeholder="+261 34 00 000 00" /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item name="company" label="Entreprise"><Input placeholder="Acme SA" /></Form.Item></Col>
          <Col xs={24} sm={12}>
            <Form.Item name="website" label="Site web" rules={[{ type: "url", message: "URL invalide (https://…)" }]}>
              <Input placeholder="https://acme.com" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={8}><Form.Item name="sector" label="Secteur"><Input placeholder="Tech, Finance…" /></Form.Item></Col>
          <Col xs={24} sm={8}><Form.Item name="city" label="Ville"><Input placeholder="Antananarivo" /></Form.Item></Col>
          <Col xs={24} sm={8}><Form.Item name="country" label="Pays"><Input placeholder="Madagascar" /></Form.Item></Col>
        </Row>
        <Form.Item name="source" label="Source"><Input placeholder="LinkedIn, salon, formulaire…" /></Form.Item>
        <Form.Item name="notes" label="Notes"><Input.TextArea rows={4} placeholder="Contexte, besoins, prochaine étape…" /></Form.Item>
      </Form>
    </Drawer>
  );
}
