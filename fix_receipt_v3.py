import yaml
from datetime import datetime, timezone

filepath = '/root/docs/tasks/tk-20260506-001/artifacts/owner-evidence-20260510-b6-openclaw-sql-reference-001.yaml'

with open(filepath, 'r') as f:
    lines = f.readlines()

fixed_lines = []
for line in lines:
    stripped = line.strip()
    # Fix psql command with \" inside double quotes
    if stripped.startswith('command: "psql'):
        inner = stripped[len('command: "'):]
        inner = inner[:-1]  # remove trailing "
        new_line = line.replace(stripped, "command: '" + inner + "'")
        fixed_lines.append(new_line)
    # Fix find command with backslash pipe inside double quotes
    elif stripped.startswith('command: "find') and 'openclaw' in line:
        inner = stripped[len('command: "'):]
        inner = inner[:-1]  # remove trailing "
        new_line = line.replace(stripped, "command: '" + inner + "'")
        fixed_lines.append(new_line)
    else:
        fixed_lines.append(line)

with open(filepath, 'w') as f:
    f.writelines(fixed_lines)

# Parse to verify
data = yaml.safe_load(open(filepath))

# Add missing guardrail fields
if 'implementation_allowed' not in data:
    data['implementation_allowed'] = False
if 'remote_product_code_write_allowed' not in data:
    data['remote_product_code_write_allowed'] = False
if 'formal_database_write_allowed' not in data:
    data['formal_database_write_allowed'] = False
if 'pass_does_not_mean_implementation_ready' not in data:
    data['pass_does_not_mean_implementation_ready'] = True

# Ensure key fields remain unchanged
data['target_gate'] = 'B6'
data['intake_status'] = 'incomplete'
data['triage_verdict'] = 'incomplete'

# Add amended_by
if 'amended_by' not in data:
    data['amended_by'] = []
data['amended_by'].append({
    'agent': 'codex-remote-claude-code',
    'action': 'mechanical_yaml_syntax_fix_plus_guardrail_fields',
    'at': datetime.now(timezone.utc).isoformat(),
    'note': 'Fixed illegal escape sequences in double-quoted strings; added missing guardrail fields; preserved all semantics and intake_status.'
})

# Write final
with open(filepath, 'w') as f:
    yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

# Re-verify
with open(filepath, 'r') as f:
    verify = yaml.safe_load(f)

assert verify['target_gate'] == 'B6'
assert verify['intake_status'] == 'incomplete'
assert verify['triage_verdict'] == 'incomplete'
assert verify['implementation_allowed'] == False
assert verify['remote_product_code_write_allowed'] == False
assert verify['formal_database_write_allowed'] == False
assert verify['pass_does_not_mean_implementation_ready'] == True

print('YAML_OK')
