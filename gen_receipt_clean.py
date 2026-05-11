import yaml
from datetime import datetime, timezone

filepath = '/root/docs/tasks/tk-20260506-001/artifacts/owner-evidence-20260510-b6-openclaw-sql-reference-001.yaml'

data = {
    'receipt_id': 'owner-evidence-20260510-b6-openclaw-sql-reference-001',
    'target_gate': 'B6',
    'submitted_by': 'remote-claude-code-readonly-pre-gate',
    'submitted_at': '2026-05-10T12:30:00+08:00',
    'owner_decision_ref': None,
    'source_refs': [
        {
            'path': '/root/claude_harness/sql/03_hardware.sql',
            'description': 'OpenClaw MVP hardware schema (servers, components, gpu_fault_dict, fault_logs, metrics_snapshots, vendor_manuals, component_replacements, gpu_models)',
            'sha256': 'e34a9c8e680fe89de2d19db81e8aa410dbfa307ad347a9f0049599c5dc9333a7',
            'mtime': '2026-05-03T19:05:36+08:00',
            'size_bytes': 6498
        },
        {
            'path': '/root/claude_harness/sql/01_business.sql',
            'description': 'OpenClaw MVP business schema (users, contracts, devices, inventory, tickets, customers, warranties, sops)',
            'sha256': '1923f198979dff0b31a15620ced24da03a96d9092f34603cb0af1ec6fa8b4497',
            'mtime': '2026-04-29T22:08:58+08:00',
            'size_bytes': 5824
        },
        {
            'path': '/opt/harness/docs/openclaw-harness-adapter-pre-gate-analysis.md',
            'description': 'Pre-gate analysis report comparing OpenClaw MVP against Harness architecture',
            'sha256': '16dcb05b4307ff8e603521b5b587557bf8f26f7f3d6894c634b4b7a09caea698',
            'mtime': '2026-05-10T11:42:55+08:00',
            'size_bytes': 15234
        },
        {
            'path': '/opt/harness/docs/harness-detailed-design-v1.md',
            'description': 'Harness detailed design specification v5.2 (source of truth)',
            'sha256': 'f43b1bd7fa6bc5f9e6a81d92daf040052de73b6ada50a7b5925ccec5f76285eb',
            'mtime': '2026-05-06T10:43:04+08:00',
            'size_bytes': 154394
        },
        {
            'path': '/opt/harness/docs/harness-architecture-patch-v1.md',
            'description': 'Harness architecture patch v1.0 (8 functional packages, 5 ADRs, 63 tables, 28 NATS events)',
            'sha256': '6c49082992f80ebf10e428eda51430bc1659c9fd19b8fa6d0d29a00980a0f52d',
            'mtime': '2026-05-09T20:17:01+08:00',
            'size_bytes': 111943
        }
    ],
    'contract_refs': [
        {
            'path': '/opt/harness/docs/norms-archive/openclaw-codex-gate-refs/process/50-owner-evidence-single-gate-intake-runbook.md',
            'description': 'Owner Evidence Single Gate Intake Runbook'
        },
        {
            'path': '/opt/harness/docs/norms-archive/openclaw-codex-gate-refs/artifacts/owner-evidence-single-gate-intake-template.yaml',
            'description': 'Machine-readable receipt template'
        },
        {
            'path': '/opt/harness/docs/norms-archive/openclaw-codex-gate-refs/openclaw-harness-adapter-pre-gate-analysis-codex-addendum.md',
            'description': 'Codex addendum correcting gate mapping from B3 to B6'
        }
    ],
    'test_evidence_refs': [],
    'security_refs': [
        {
            'note': 'B6 scope touches data import security; formal RLS/security tests not yet available',
            'required': True,
            'status': 'missing'
        }
    ],
    'rollback_refs': [
        {
            'note': 'No import staging DDL, adoption state machine, reverse index, or rollback contract exists yet',
            'required': True,
            'status': 'missing'
        }
    ],
    'remote_observation_refs': [
        {
            'observation': 'Read-only verification of /opt/harness/src/modules/ file count',
            'command': 'find /opt/harness/src/modules -type f | wc -l',
            'result': '5',
            'observed_at': '2026-05-10T12:30:00+08:00'
        },
        {
            'observation': 'Read-only verification of /opt/harness/sql/ file count',
            'command': 'find /opt/harness/sql -type f | wc -l',
            'result': '13',
            'observed_at': '2026-05-10T12:30:00+08:00'
        },
        {
            'observation': 'Git status of /opt/harness shows no product code changes from OpenClaw',
            'command': 'git -C /opt/harness status --short',
            'result': 'docs/norms-archive/openclaw-codex-gate-refs/\ndocs/openclaw-harness-adapter-pre-gate-analysis.md',
            'observed_at': '2026-05-10T12:30:00+08:00'
        },
        {
            'observation': 'Git log confirms last product commit is Sprint 0 data model freeze',
            'command': 'git -C /opt/harness log --oneline -1',
            'result': 'a44836a feat: Sprint 0 architecture patch - data model freeze',
            'observed_at': '2026-05-10T12:30:00+08:00'
        },
        {
            'observation': 'OpenClaw hardware.py uses in-memory storage, not Harness formal tables',
            'command': "grep -n '_devices|_fault_logs' /root/claude_harness/src/api/routes/hardware.py",
            'result': 'Lines 43, 53, 56, 57, 66, 67, 93, 94, 100, 101, 108, 125, 126',
            'observed_at': '2026-05-10T12:30:00+08:00'
        }
    ],
    'readonly_verification_plan': [
        {
            'step': 1,
            'action': 'Verify OpenClaw SQL files are reference-only and not imported into Harness formal tables',
            'command': "psql -d harness -c 'SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'harness_hardware' AND tablename IN ('servers', 'components', 'gpu_fault_dict', 'fault_logs')'",
            'expected': 'Empty result or only Sprint0-created tables'
        },
        {
            'step': 2,
            'action': 'Verify no OpenClaw product code was copied into /opt/harness/src/modules/',
            'command': "find /opt/harness/src/modules -name '*.py' -exec grep -l 'openclaw|claude_harness' {} +",
            'expected': 'No matches'
        },
        {
            'step': 3,
            'action': 'Verify /opt/harness git status shows only docs changes, no src/ changes',
            'command': 'git -C /opt/harness status --short | grep "^?? docs/"',
            'expected': 'Only docs/ untracked files'
        },
        {
            'step': 4,
            'action': 'Compare OpenClaw gpu_fault_dict seed data against Harness schema requirements',
            'command': "bash -c 'diff <(grep INSERT INTO harness_hardware.gpu_fault_dict /root/claude_harness/sql/03_hardware.sql | wc -l) <(echo 10)'",
            'expected': 'Match (10 seed rows)'
        }
    ],
    'intake_status': 'incomplete',
    'triage_verdict': 'incomplete',
    'triage_notes': [
        'OpenClaw SQL and seed data are useful reference evidence for Harness hardware domain design.',
        'Evidence does NOT prove Harness import staging readiness (no staging DDL, no bundle schema, no dry-run validation).',
        'Evidence does NOT include owner decision for data adoption.',
        'Evidence does NOT include adoption state machine, reverse index, or rollback contract.',
        'Evidence does NOT include security tests for RBAC/RLS during import.',
        'Per addendum, target_gate corrected from B3 to B6 because this evidence concerns data import/staging/adoption risk.',
        'Product code remains untouched; no formal Harness tables written; git status confirms only docs additions.',
        'Receipt intentionally marked incomplete to reflect missing owner evidence for B6 rehearing review.'
    ],
    'implementation_allowed': False,
    'remote_product_code_write_allowed': False,
    'formal_database_write_allowed': False,
    'pass_does_not_mean_implementation_ready': True,
    'amended_by': [
        {
            'agent': 'codex-remote-claude-code',
            'action': 'mechanical_yaml_syntax_fix_plus_guardrail_fields',
            'at': datetime.now(timezone.utc).isoformat(),
            'note': 'Regenerated receipt from clean data structure to fix illegal escape sequences; added missing guardrail fields; preserved all semantics and intake_status.'
        }
    ]
}

with open(filepath, 'w') as f:
    yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

# Verify
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
print('FIX_SUMMARY:')
print('  - Regenerated receipt from clean Python dict to eliminate all escape sequence issues')
print('  - Added implementation_allowed: false')
print('  - Added remote_product_code_write_allowed: false')
print('  - Added formal_database_write_allowed: false')
print('  - Added pass_does_not_mean_implementation_ready: true')
print('  - Added amended_by provenance entry')
print('  - Preserved target_gate: B6, intake_status: incomplete, triage_verdict: incomplete')
