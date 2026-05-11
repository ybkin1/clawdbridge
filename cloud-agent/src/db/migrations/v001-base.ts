/**
 * ClawdBridge Cloud Agent — Database migration v001: base schema.
 */
export interface Migration {
  version: number;
  up: string;
}

const v001: Migration = {
  version: 1,
  up: `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
INSERT INTO schema_version VALUES (1);`,
};

export default v001;
