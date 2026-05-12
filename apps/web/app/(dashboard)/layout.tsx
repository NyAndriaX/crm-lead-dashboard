import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import { getSession } from "@/lib/auth";

// Layout des pages protégées. Vérification de session côté serveur ;
// le contrôle RBAC fin est appliqué dans chaque Route Handler / page.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell user={{ name: session.name, email: session.email, role: session.role }}>
      {children}
    </DashboardShell>
  );
}
