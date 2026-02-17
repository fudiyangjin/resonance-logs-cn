-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Entities table (global player cache)
CREATE TABLE IF NOT EXISTS entities (
  entity_id INTEGER PRIMARY KEY,
  name TEXT,
  class_id INTEGER,
  class_spec INTEGER,
  ability_score INTEGER,
  level INTEGER,
  first_seen_ms INTEGER,
  last_seen_ms INTEGER,
  attributes TEXT
);
CREATE INDEX IF NOT EXISTS idx_entities_last_seen ON entities(last_seen_ms);

-- Detailed player data cache
CREATE TABLE IF NOT EXISTS detailed_playerdata (
  player_id INTEGER PRIMARY KEY NOT NULL,
  last_seen_ms INTEGER NOT NULL,
  vdata_bytes BLOB
);

-- Encounters table
CREATE TABLE IF NOT EXISTS encounters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at_ms INTEGER NOT NULL,
  ended_at_ms INTEGER,
  local_player_id INTEGER,
  total_dmg INTEGER DEFAULT 0,
  total_heal INTEGER DEFAULT 0,
  scene_id INTEGER,
  scene_name TEXT,
  duration REAL NOT NULL DEFAULT 0.0,
  uploaded_at_ms INTEGER,
  remote_encounter_id INTEGER,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_manually_reset INTEGER NOT NULL DEFAULT 0,
  boss_names TEXT,
  player_names TEXT
);
CREATE INDEX IF NOT EXISTS idx_encounters_started ON encounters(started_at_ms);

-- Encoded encounter payload (compressed MessagePack of combat entities only)
CREATE TABLE IF NOT EXISTS encounter_data (
  encounter_id INTEGER PRIMARY KEY NOT NULL,
  data BLOB NOT NULL,
  FOREIGN KEY(encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
);

-- App config
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

