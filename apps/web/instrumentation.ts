/**
 * Hook Next.js exécuté une seule fois au démarrage du serveur : lance le processeur
 * des tâches de fond (@crm/jobs) dans le même process que l'application web.
 *
 * Le code Node (IMAP, SMTP, Prisma…) vit dans instrumentation-node.ts : la condition
 * sur NEXT_RUNTIME est résolue à la compilation, ce fichier n'est donc jamais
 * embarqué dans le bundle Edge (middleware).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackgroundJobs } = await import("./instrumentation-node");
    await startBackgroundJobs();
  }
}
