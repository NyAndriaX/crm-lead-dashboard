-- Coordonnées supplémentaires (téléphones du site, email / ligne directe du décideur), chiffrées AES-256-GCM.
ALTER TABLE `leads` ADD COLUMN `contactsEnc` BLOB NULL;
