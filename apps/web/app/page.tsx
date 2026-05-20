import { redirect } from "next/navigation";

export default function Home() {
  // Redirection vers le tableau de bord principal.
  redirect("/dashboard");
}
