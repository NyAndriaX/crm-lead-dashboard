/**
 * Service Teams — gestion des équipes commerciales (U-03).
 *
 * Une équipe regroupe plusieurs utilisateurs (User.teamId → Team.id) et
 * permet à terme une vue filtrée des leads par équipe (déjà supporté par
 * le filtre `assignedToId` côté leads — l'extension "leads de mon équipe"
 * relève des modules Leads / Pipeline et reste optionnelle ici).
 */
import { prisma } from "@crm/db";

export type TeamItem = {
  id: string;
  name: string;
  memberCount: number;
  members: { id: string; name: string; email: string; role: string }[];
  createdAt: Date;
};

export async function listTeams(): Promise<TeamItem[]> {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      members: {
        select: { id: true, name: true, email: true, role: true, isActive: true },
        orderBy: { name: "asc" },
      },
    },
  });
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    memberCount: t.members.filter((m) => m.isActive).length,
    members: t.members,
    createdAt: t.createdAt,
  }));
}

export async function getTeam(id: string): Promise<TeamItem | null> {
  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        select: { id: true, name: true, email: true, role: true, isActive: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    memberCount: team.members.filter((m) => m.isActive).length,
    members: team.members,
    createdAt: team.createdAt,
  };
}

export async function createTeam(name: string): Promise<TeamItem> {
  const team = await prisma.team.create({ data: { name } });
  return { id: team.id, name: team.name, memberCount: 0, members: [], createdAt: team.createdAt };
}

export async function renameTeam(id: string, name: string): Promise<void> {
  await prisma.team.update({ where: { id }, data: { name } });
}

export async function deleteTeam(id: string): Promise<void> {
  // Détache d'abord les membres (User.teamId nullable).
  await prisma.user.updateMany({ where: { teamId: id }, data: { teamId: null } });
  await prisma.team.delete({ where: { id } });
}

export async function setTeamMembers(teamId: string, userIds: string[]): Promise<void> {
  // Approche idempotente : on retire tous les membres actuels qui ne sont plus listés,
  // et on ajoute les nouveaux.
  const current = await prisma.user.findMany({
    where: { teamId },
    select: { id: true },
  });
  const currentIds = new Set(current.map((u) => u.id));
  const nextIds = new Set(userIds);

  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));
  const toAdd = [...nextIds].filter((id) => !currentIds.has(id));

  if (toRemove.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: toRemove } },
      data: { teamId: null },
    });
  }
  if (toAdd.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: toAdd } },
      data: { teamId },
    });
  }
}
