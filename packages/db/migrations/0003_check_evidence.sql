-- Second Key: AI checks keep their grounded evidence as data (quote, speaker, tactic, source), so
-- reviewer screens never parse the human-readable detail string. Additive and nullable: existing
-- rows and deterministic checks have none.
ALTER TABLE checks ADD COLUMN evidence jsonb;
