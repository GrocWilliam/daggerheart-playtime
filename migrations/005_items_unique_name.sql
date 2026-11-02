CREATE UNIQUE INDEX IF NOT EXISTS items_character_name_uniq
	ON items (character_id, lower(btrim(name)));
