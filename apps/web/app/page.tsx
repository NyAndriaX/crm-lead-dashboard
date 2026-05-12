import { redirect } from "next/navigation";

export default function Home() {
  // L'entrée du dashboard est la liste des leads (l'auth/redirection login
  // sera gérée par middleware.ts — cf. CRM-007).
  redirect("/leads");
}
