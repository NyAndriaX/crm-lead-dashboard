# Index MongoDB non gérés par Prisma (CRM-004)

Prisma ne sait pas déclarer les **TTL indexes** ni certains index spéciaux.
À créer manuellement après `prisma db push` (script `mongosh`) :

```js
// TTL 12 mois (≈ 31 536 000 s) sur les logs
db.auditLogs.createIndex({ createdAt: 1 }, { expireAfterSeconds: 31536000 });
db.leadHistory.createIndex({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

// TTL 90 jours sur les jobs d'import
db.importJobs.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// Unicité partielle sur leads.emailHash (les leads sans email sont autorisés)
db.leads.createIndex(
  { emailHash: 1 },
  { unique: true, partialFilterExpression: { emailHash: { $type: "string" } } }
);
```

> Le text index `firstName/lastName/company/notes` est généré par Prisma via `@@fulltext`
> (preview feature `fullTextIndex`). En production sur MongoDB Atlas, on pourra
> basculer vers Atlas Search (cf. annexe §4.1).
