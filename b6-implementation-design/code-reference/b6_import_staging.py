"""
B6 Import Staging — OpenClaw Structured Data Adoption

改编自 OpenClaw fault-data/structured/ 案例数据
职责：将 OpenClaw 历史故障案例导入 Harness harness_hardware schema

位置：src/modules/data_import/b6_import_staging.py
Owner: PKG-10 (data import)
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any


# ---------------------------------------------------------------------------
# 数据类：OpenClaw 案例结构
# ---------------------------------------------------------------------------

@dataclass
class OpenClawCase:
    """OpenClaw 结构化案例数据（如 cld-dnode53.case-summary.json）"""
    case_id: str
    hostname: str
    gpu_inventory: list[dict[str, Any]]
    primary_fault: dict[str, Any]
    xid_counts_by_code: dict[str, int]
    evidence_events: list[dict[str, Any]]
    post_recovery_observation: dict[str, Any] | None


# ---------------------------------------------------------------------------
# Import Runner
# ---------------------------------------------------------------------------

class B6ImportRunner:
    """
    B6 Import Staging 执行器。
    流程：stage → dry-run → adopt → reverse_index
    """

    def __init__(self, db_pool: Any, tenant_id: str, batch_label: str):
        self.db_pool = db_pool
        self.tenant_id = tenant_id
        self.batch_label = batch_label

    # ------------------------------------------------------------------
    # 主流程
    # ------------------------------------------------------------------

    async def run(self, cases: list[OpenClawCase]) -> dict[str, Any]:
        """执行完整导入流程。"""
        batch_id = await self._create_batch(len(cases))

        staged = 0
        adopted = 0
        failed = 0
        errors: list[str] = []

        for case in cases:
            try:
                # 1. Stage
                record_id = await self._stage_record(batch_id, case)
                staged += 1

                # 2. Dry-run validation
                valid, reason = await self._dry_run_validate(case)
                if not valid:
                    await self._mark_failed(record_id, reason)
                    failed += 1
                    errors.append(f"{case.case_id}: {reason}")
                    continue

                # 3. Adopt（写入 harness_hardware）
                await self._adopt_case(case)
                await self._mark_adopted(record_id)
                adopted += 1

            except Exception as exc:
                failed += 1
                errors.append(f"{case.case_id}: {str(exc)}")

        # 4. Reverse index
        await self._build_reverse_index()

        await self._close_batch(batch_id, staged, adopted, failed)

        return {
            "batch_id": batch_id,
            "batch_label": self.batch_label,
            "total_cases": len(cases),
            "staged": staged,
            "adopted": adopted,
            "failed": failed,
            "errors": errors,
        }

    # ------------------------------------------------------------------
    # Stage
    # ------------------------------------------------------------------

    async def _create_batch(self, total_records: int) -> int:
        row = await self.db_pool.fetchrow(
            """
            INSERT INTO harness_import_staging.import_batches (
                tenant_id, batch_label, source_system, total_records, status
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            """,
            self.tenant_id, self.batch_label, "openclaw", total_records, "running",
        )
        return row["id"]

    async def _stage_record(self, batch_id: int, case: OpenClawCase) -> int:
        payload = json.dumps({
            "case_id": case.case_id,
            "hostname": case.hostname,
            "gpu_inventory": case.gpu_inventory,
            "primary_fault": case.primary_fault,
            "xid_counts_by_code": case.xid_counts_by_code,
            "evidence_events": case.evidence_events,
            "post_recovery_observation": case.post_recovery_observation,
        })
        row = await self.db_pool.fetchrow(
            """
            INSERT INTO harness_import_staging.staged_records (
                batch_id, tenant_id, source_system, source_id,
                payload, status
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            batch_id, self.tenant_id, "openclaw", case.case_id,
            payload, "staged",
        )
        return row["id"]

    # ------------------------------------------------------------------
    # Dry-run Validation
    # ------------------------------------------------------------------

    async def _dry_run_validate(self, case: OpenClawCase) -> tuple[bool, str]:
        """验证 case 数据是否符合 Harness schema 约束。"""
        if not case.primary_fault:
            return False, "Missing primary_fault"

        # 验证 tenant_id 已标记（B6 要求）
        if not self.tenant_id:
            return False, "tenant_id is required for adoption"

        # 验证 gpu_inventory 非空
        if not case.gpu_inventory:
            return False, "Empty gpu_inventory"

        return True, ""

    # ------------------------------------------------------------------
    # Adoption
    # ------------------------------------------------------------------

    async def _adopt_case(self, case: OpenClawCase) -> None:
        """
        将 OpenClaw case 写入 harness_hardware 各表。
        使用单事务保证原子性。
        """
        async with self.db_pool.acquire() as conn:
            async with conn.transaction():
                # 1. 创建/更新主机 system_asset（hostname 映射到主机资产）
                system_asset_id: str | None = None
                if case.hostname:
                    sys_row = await conn.fetchrow(
                        """
                        INSERT INTO harness_assets.asset_registry (
                            tenant_id, asset_type, serial_number, model, vendor,
                            status
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (tenant_id, serial_number)
                        DO UPDATE SET model = EXCLUDED.model, updated_at = NOW()
                        RETURNING id
                        """,
                        self.tenant_id, "server", case.hostname,
                        case.hostname, "NVIDIA", "active",
                    )
                    system_asset_id = str(sys_row["id"])

                # 2. 创建/更新 GPU component 资产
                gpu_asset_ids: dict[str, str] = {}
                primary_component_asset_id: str | None = None
                for gpu in case.gpu_inventory:
                    serial = gpu.get("serial") or gpu.get("board_serial")
                    if not serial:
                        continue
                    asset_row = await conn.fetchrow(
                        """
                        INSERT INTO harness_assets.asset_registry (
                            tenant_id, asset_type, serial_number, model, vendor,
                            part_number, status
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                        ON CONFLICT (tenant_id, serial_number)
                        DO UPDATE SET model = EXCLUDED.model, updated_at = NOW()
                        RETURNING id
                        """,
                        self.tenant_id, "gpu", serial,
                        gpu.get("model", "NVIDIA GPU"), "NVIDIA",
                        gpu.get("part_number"), "active",
                    )
                    gpu_asset_ids[serial] = str(asset_row["id"])
                    # primary_component 优先取 primary_fault 中标记的 GPU，否则取第一个
                    if pf.get("primary_gpu_serial") == serial or primary_component_asset_id is None:
                        primary_component_asset_id = str(asset_row["id"])

                # 3. 创建 slot_bindings（简化：每个 GPU 绑定到主机的一个 slot）
                for idx, gpu in enumerate(case.gpu_inventory):
                    serial = gpu.get("serial") or gpu.get("board_serial")
                    if not serial or serial not in gpu_asset_ids:
                        continue
                    await conn.execute(
                        """
                        INSERT INTO harness_hardware.slot_bindings (
                            tenant_id, host_system_asset_id, component_asset_id,
                            slot_name, slot_type, location_path, mounted_at, source_version
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT DO NOTHING
                        """,
                        self.tenant_id, system_asset_id, gpu_asset_ids[serial],
                        f"slot_{idx}", gpu.get("slot_type", "pcie"),
                        json.dumps({"bus": gpu.get("pci_bdf")}), datetime.utcnow(), "1.0",
                    )

                # 4. 创建 fault_incident
                pf = case.primary_fault
                occurred_at = self._parse_time(pf.get("occurred_at")) or datetime.utcnow()
                # system_asset 必须有，否则生成占位 UUID
                if not system_asset_id:
                    system_asset_id = str(uuid.uuid4())
                inc_row = await conn.fetchrow(
                    """
                    INSERT INTO harness_hardware.fault_incidents (
                        external_ref, tenant_id, system_asset_id, primary_component_asset_id,
                        incident_source, fault_occurred_at, detected_at,
                        severity, fault_category, fault_code, fault_name,
                        symptom_text, current_status, location_snapshot, source_version
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    RETURNING id, fault_occurred_at
                    """,
                    case.case_id, self.tenant_id,
                    system_asset_id, primary_component_asset_id,
                    "openclaw_import", occurred_at, datetime.utcnow(),
                    pf.get("severity", "Major"), pf.get("category", "hardware_gpu"),
                    pf.get("fault_code"), pf.get("fault_name", "Imported Fault"),
                    pf.get("symptom", "Imported from OpenClaw case data"),
                    "open", json.dumps({"hostname": case.hostname}), "1.0",
                )
                incident_id = inc_row["id"]
                incident_occurred_at = inc_row["fault_occurred_at"]

                # 4. 创建 fault_evidences
                for i, ev in enumerate(case.evidence_events):
                    observed_at = self._parse_time(ev.get("timestamp")) or occurred_at
                    await conn.execute(
                        """
                        INSERT INTO harness_hardware.fault_evidences (
                            external_ref, incident_id, incident_occurred_at,
                            evidence_type, observed_at, source_system,
                            summary_text, dedupe_key, tenant_id
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        ON CONFLICT DO NOTHING
                        """,
                        f"{case.case_id}_ev_{i}", incident_id, incident_occurred_at,
                        ev.get("type", "log"), observed_at, "openclaw",
                        ev.get("summary", "")[:500],
                        f"{case.case_id}_{i}", self.tenant_id,
                    )

                # 5. 创建 incident_result（如果有恢复观察）
                if case.post_recovery_observation:
                    pro = case.post_recovery_observation
                    await conn.execute(
                        """
                        INSERT INTO harness_hardware.incident_results (
                            incident_id, concluded_at, conclusion_code,
                            root_cause_confirmed, final_root_cause,
                            repair_effectiveness, recurrence_risk,
                            summary, tenant_id, closed_by_type, closed_by_id
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        ON CONFLICT (incident_id) DO NOTHING
                        """,
                        incident_id, datetime.utcnow(),
                        pro.get("conclusion_code", "resolved"),
                        pro.get("root_cause_confirmed", False),
                        pro.get("final_root_cause", "Unknown"),
                        pro.get("repair_effectiveness"),
                        pro.get("recurrence_risk"),
                        pro.get("summary", "No summary"),
                        self.tenant_id, "system", "b6_import",
                    )

    # ------------------------------------------------------------------
    # Reverse Index
    # ------------------------------------------------------------------

    async def _build_reverse_index(self) -> None:
        """
        建立反向索引，支持 external_ref → harness id 查询。
        """
        await self.db_pool.execute(
            """
            INSERT INTO harness_import_staging.reverse_index (
                tenant_id, source_system, source_id, canonical_schema, canonical_table, canonical_id
            )
            SELECT
                fi.tenant_id,
                'openclaw' AS source_system,
                fi.external_ref AS source_id,
                'harness_hardware' AS canonical_schema,
                'fault_incidents' AS canonical_table,
                fi.id::TEXT AS canonical_id
            FROM harness_hardware.fault_incidents fi
            WHERE fi.external_ref LIKE 'cld-%'
              AND NOT EXISTS (
                  SELECT 1 FROM harness_import_staging.reverse_index ri
                  WHERE ri.source_id = fi.external_ref AND ri.tenant_id = fi.tenant_id
              )
            """
        )

    # ------------------------------------------------------------------
    # Batch Management
    # ------------------------------------------------------------------

    async def _mark_failed(self, record_id: int, reason: str) -> None:
        await self.db_pool.execute(
            """
            UPDATE harness_import_staging.staged_records
            SET status = 'failed', error_message = $2, updated_at = NOW()
            WHERE id = $1
            """,
            record_id, reason,
        )

    async def _mark_adopted(self, record_id: int) -> None:
        await self.db_pool.execute(
            """
            UPDATE harness_import_staging.staged_records
            SET status = 'adopted', updated_at = NOW()
            WHERE id = $1
            """,
            record_id,
        )

    async def _close_batch(self, batch_id: int, staged: int, adopted: int, failed: int) -> None:
        status = "completed" if failed == 0 else "completed_with_errors" if adopted > 0 else "failed"
        await self.db_pool.execute(
            """
            UPDATE harness_import_staging.import_batches
            SET status = $2, staged_count = $3, adopted_count = $4, failed_count = $5, closed_at = NOW()
            WHERE id = $1
            """,
            batch_id, status, staged, adopted, failed,
        )

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_time(value: Any) -> datetime | None:
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except Exception:
            return None


# ---------------------------------------------------------------------------
# 便利入口
# ---------------------------------------------------------------------------

async def import_openclaw_cases(
    db_pool: Any,
    tenant_id: str,
    cases: list[dict[str, Any]],
    batch_label: str = "openclaw_migration",
) -> dict[str, Any]:
    """
    一键导入 OpenClaw 案例列表。
    """
    runner = B6ImportRunner(db_pool, tenant_id, batch_label)
    typed_cases = [
        OpenClawCase(
            case_id=c.get("case_id", f"imported_{i}"),
            hostname=c.get("hostname", "unknown"),
            gpu_inventory=c.get("gpu_inventory", []),
            primary_fault=c.get("primary_fault", {}),
            xid_counts_by_code=c.get("xid_counts_by_code", {}),
            evidence_events=c.get("evidence_events", []),
            post_recovery_observation=c.get("post_recovery_observation"),
        )
        for i, c in enumerate(cases)
    ]
    return await runner.run(typed_cases)
