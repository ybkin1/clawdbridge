"""
Diagnosis Worker — Harness 诊断模块

改编自 OpenClaw diagnosis_run 逻辑
职责：异步编排证据提取 → GPU 故障分析 → 结果持久化 → 事件发布

位置：src/modules/ticket/diagnosis/diagnosis_worker.py
Owner: PKG-06 (diagnosis-worker)
"""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# 常量 / 枚举
# ---------------------------------------------------------------------------

class DiagnosisStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class DiagnosisMethod(str, Enum):
    rule_based = "rule_based"          # OpenClaw 原始规则匹配
    ai_assisted = "ai_assisted"        # AI + 规则混合
    fallback_rule = "fallback_rule"    # AI 不可用时的降级


# ---------------------------------------------------------------------------
# 数据类
# ---------------------------------------------------------------------------

@dataclass
class DiagnosisContext:
    """诊断任务上下文"""
    diagnosis_context_id: str
    tenant_id: str
    incident_id: int
    ticket_id: str | None
    requested_by_type: str
    requested_by_id: str
    actor_ref: str
    method: DiagnosisMethod = DiagnosisMethod.rule_based
    notes: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class DiagnosisOutput:
    """诊断结果（将写入 diagnosis_records）"""
    suspected_root_cause: str
    root_cause_category: str | None
    reasoning_summary: str
    confidence_score: float
    graph_query_ref: str | None
    evidence_summary: str
    event_count: int
    xid_breakdown: dict[str, int]
    signal_breakdown: dict[str, int]
    cluster_summary: list[dict[str, Any]]
    low_confidence_count: int
    raw_result_json: dict[str, Any]


# ---------------------------------------------------------------------------
# 核心 Worker
# ---------------------------------------------------------------------------

class DiagnosisWorker:
    """
    诊断工作器：编排证据提取、分析执行、结果写入、事件发布的完整流水线。

    用法：
        worker = DiagnosisWorker(db_pool, nats_client, extractor, analyzer)
        output = await worker.run(context)
    """

    def __init__(
        self,
        db_pool: Any,  # asyncpg.Pool
        nats_client: Any | None,  # nats.aio.client.Client | None
        extractor: Any,  # EvidenceExtractor
        analyzer: Any,  # GpuFaultAnalyzer
    ):
        self.db_pool = db_pool
        self.nats = nats_client
        self.extractor = extractor
        self.analyzer = analyzer

    # ------------------------------------------------------------------
    # 主入口
    # ------------------------------------------------------------------

    async def run(self, ctx: DiagnosisContext) -> DiagnosisOutput:
        """执行完整诊断流水线。"""
        started_at = datetime.utcnow()

        # 1. 更新状态为 running
        await self._update_status(ctx, DiagnosisStatus.running)

        try:
            # 2. 提取证据流
            streams = []
            async for stream in self.extractor.from_incident(
                self.db_pool, ctx.incident_id, ctx.tenant_id
            ):
                streams.append(stream)

            if not streams:
                raise ValueError(f"No evidence found for incident {ctx.incident_id}")

            # 3. 运行分析（逐个流分析，合并结果）
            all_events: list[Any] = []
            all_gpu_identities: list[Any] = []
            all_counters: dict[str, int] = {}
            all_xid_by_code: dict[str, int] = {}
            all_clusters: list[dict[str, Any]] = []
            total_low_confidence = 0

            for stream in streams:
                result = await self.analyzer.analyze_text_stream(
                    stream.line_stream,
                    ctx.tenant_id,
                    ctx.diagnosis_context_id,
                    ctx.actor_ref,
                )
                all_events.extend(result.events)
                all_gpu_identities.extend(result.gpu_identities)
                for k, v in result.counters.items():
                    all_counters[k] = all_counters.get(k, 0) + v
                for k, v in result.xid_by_code.items():
                    all_xid_by_code[k] = all_xid_by_code.get(k, 0) + v
                all_clusters.extend(result.clusters)
                total_low_confidence += result.low_confidence_count

            # 4. 生成诊断结论（规则匹配 → 根因推断）
            output = self._generate_diagnosis(
                ctx, all_events, all_gpu_identities, all_counters,
                all_xid_by_code, all_clusters, total_low_confidence,
            )

            # 5. 写入数据库
            diagnosis_id = await self._persist_diagnosis(ctx, output, started_at)

            # 6. 发布事件
            await self._publish_event(ctx, output, diagnosis_id, "diagnosis.completed")

            # 7. 更新状态
            await self._update_status(ctx, DiagnosisStatus.completed)

            return output

        except Exception as exc:
            await self._update_status(ctx, DiagnosisStatus.failed, error=str(exc))
            await self._publish_event(ctx, None, None, "diagnosis.failed")
            raise

    async def quick_scan(self, ctx: DiagnosisContext) -> dict[str, Any]:
        """
        快速扫描：不写入数据库，仅返回预览结果。
        用于工单诊断面板的前置检查。
        """
        from evidence_extractor import quick_scan_evidence  # type: ignore
        return await quick_scan_evidence(
            self.extractor, self.analyzer, self.db_pool,
            ctx.incident_id, ctx.tenant_id,
            ctx.diagnosis_context_id, ctx.actor_ref,
        )

    async def counter_scan(self, ctx: DiagnosisContext) -> dict[str, Any]:
        """
        计数扫描：仅返回聚合计数，用于报告和 dashboard。
        """
        from evidence_extractor import counter_scan_evidence  # type: ignore
        return await counter_scan_evidence(
            self.extractor, self.analyzer, self.db_pool,
            ctx.incident_id, ctx.tenant_id,
            ctx.diagnosis_context_id, ctx.actor_ref,
        )

    # ------------------------------------------------------------------
    # 内部：诊断生成
    # ------------------------------------------------------------------

    def _generate_diagnosis(
        self,
        ctx: DiagnosisContext,
        events: list[Any],
        gpu_identities: list[Any],
        counters: dict[str, int],
        xid_by_code: dict[str, int],
        clusters: list[dict[str, Any]],
        low_confidence_count: int,
    ) -> DiagnosisOutput:
        """
        基于规则匹配生成诊断结论。
        未来可扩展 AI 辅助推理（调用 LLM），当前为纯规则模式。
        """
        # 根因推断规则（按优先级）
        root_cause = "UNKNOWN"
        category = None
        confidence = 0.5

        # 规则 1：GSP timeout + GPU reset required → 驱动/GSP 固件故障
        if counters.get("gsp_timeout", 0) > 0 and counters.get("gpu_reset_required", 0) > 0:
            root_cause = "GSP_FIRMWARE_HANG_WITH_RESET"
            category = "firmware"
            confidence = 0.92

        # 规则 2：Xid 79/95/119/120/121 → 硬件 ECC/显存故障
        elif any(xid_by_code.get(c, 0) > 0 for c in ("79", "95", "119", "120", "121")):
            root_cause = "GPU_MEMORY_ECC_ERROR"
            category = "hardware_memory"
            confidence = 0.88

        # 规则 3：NVLink 错误 → 互联故障
        elif counters.get("nvlink_error", 0) > 0 or counters.get("nvlink_rxdetect", 0) > 0:
            root_cause = "NVLINK_CONNECTIVITY_DEGRADATION"
            category = "hardware_interconnect"
            confidence = 0.85

        # 规则 4： fallen off bus → 物理连接故障
        elif counters.get("gpu_fallen_off_bus", 0) > 0:
            root_cause = "GPU_PCIE_DISCONNECT"
            category = "hardware_pcie"
            confidence = 0.90

        # 规则 5：Xid 48/62/74 → 温度/功耗/电源异常
        elif any(xid_by_code.get(c, 0) > 0 for c in ("48", "62", "74")):
            root_cause = "THERMAL_OR_POWER_ANOMALY"
            category = "hardware_thermal"
            confidence = 0.82

        # 规则 6：Fabric Manager 错误 → 网络结构故障
        elif counters.get("fabric_manager_error", 0) > 0:
            root_cause = "NVSWITCH_FABRIC_MANAGER_FAILURE"
            category = "hardware_fabric"
            confidence = 0.80

        # 规则 7：driver reload → 驱动崩溃后恢复
        elif counters.get("driver_reload", 0) > 0:
            root_cause = "DRIVER_CRASH_AND_RECOVERY"
            category = "software_driver"
            confidence = 0.78

        # 规则 8：nvswitch_error → NVSwitch 故障
        elif counters.get("nvswitch_error", 0) > 0:
            root_cause = "NVSWITCH Hardware Error"
            category = "hardware_nvswitch"
            confidence = 0.84

        # 规则 9：PCIe AER → PCIe 链路错误
        elif counters.get("pcie_aer_error", 0) > 0:
            root_cause = "PCIE_LINK_DEGRADATION"
            category = "hardware_pcie"
            confidence = 0.83

        # 规则 10：kernel panic → 系统级故障
        elif counters.get("kernel_panic_oops", 0) > 0:
            root_cause = "SYSTEM_KERNEL_PANIC"
            category = "software_kernel"
            confidence = 0.86

        # 降级：仅发现一般性错误
        elif counters.get("xid_total", 0) > 0:
            root_cause = "GPU_XID_UNCLASSIFIED"
            category = "hardware_gpu"
            confidence = 0.65

        elif counters.get("generic_error_like_lines", 0) > 0:
            root_cause = "GENERIC_ERROR_PATTERN_DETECTED"
            category = "unclassified"
            confidence = 0.50

        # 生成 reasoning_summary
        from evidence_extractor import EvidenceExtractor  # type: ignore
        evidence_summary = EvidenceExtractor.build_summary(
            [e.__dict__ for e in events], max_events=50
        )

        reasoning = self._build_reasoning(
            root_cause, category, confidence,
            counters, xid_by_code, gpu_identities, clusters,
        )

        return DiagnosisOutput(
            suspected_root_cause=root_cause,
            root_cause_category=category,
            reasoning_summary=reasoning,
            confidence_score=round(confidence, 4),
            graph_query_ref=None,  # 后续 graph service 填充
            evidence_summary=evidence_summary,
            event_count=len(events),
            xid_breakdown=xid_by_code,
            signal_breakdown={k: v for k, v in counters.items() if k not in ("xid_total", "gpu_recovery_action", "generic_error_like_lines")},
            cluster_summary=clusters[:10],
            low_confidence_count=low_confidence_count,
            raw_result_json={
                "events": [e.__dict__ for e in events[:200]],
                "gpu_identities": [g.__dict__ for g in gpu_identities],
                "counters": counters,
                "clusters": clusters,
            },
        )

    def _build_reasoning(
        self,
        root_cause: str,
        category: str | None,
        confidence: float,
        counters: dict[str, int],
        xid_by_code: dict[str, int],
        gpu_identities: list[Any],
        clusters: list[dict[str, Any]],
    ) -> str:
        lines = [
            f"Suspected Root Cause: {root_cause}",
            f"Category: {category or 'unclassified'}",
            f"Confidence: {confidence:.2%}",
            "",
            "Event Distribution:",
        ]
        for k, v in sorted(counters.items(), key=lambda x: -x[1])[:10]:
            lines.append(f"  - {k}: {v}")

        if xid_by_code:
            lines.append("")
            lines.append("Xid Breakdown:")
            for code, count in sorted(xid_by_code.items(), key=lambda x: -x[1]):
                lines.append(f"  - Xid {code}: {count}")

        if gpu_identities:
            lines.append("")
            lines.append("Detected GPUs:")
            for gpu in gpu_identities:
                lines.append(f"  - GPU {gpu.gpu_index}: {gpu.model} (BDF={gpu.pci_bdf}, SN={gpu.serial or 'N/A'})")

        if clusters:
            lines.append("")
            lines.append(f"Top Clusters: {len(clusters)}")
            for c in clusters[:5]:
                lines.append(f"  - {c['bucket']} | {c['component']} | count={c['count']}")

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # 内部：持久化
    # ------------------------------------------------------------------

    async def _persist_diagnosis(
        self,
        ctx: DiagnosisContext,
        output: DiagnosisOutput,
        started_at: datetime,
    ) -> int:
        """写入 harness_hardware.diagnosis_records，返回新记录 id。"""
        diagnosis_uuid = uuid.uuid4()

        row = await self.db_pool.fetchrow(
            """
            INSERT INTO harness_hardware.diagnosis_records (
                diagnosis_uuid,
                external_ref,
                incident_id,
                diagnosis_at,
                diagnosis_method,
                suspected_root_cause,
                root_cause_category,
                reasoning_summary,
                confidence_score,
                graph_query_ref,
                created_by_type,
                created_by_id,
                created_at,
                tenant_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
            """,
            diagnosis_uuid,
            ctx.diagnosis_context_id,
            ctx.incident_id,
            datetime.utcnow(),
            ctx.method.value,
            output.suspected_root_cause,
            output.root_cause_category,
            output.reasoning_summary,
            output.confidence_score,
            output.graph_query_ref,
            ctx.requested_by_type,
            ctx.requested_by_id,
            datetime.utcnow(),
            ctx.tenant_id,
        )
        return row["id"]

    async def _update_status(
        self,
        ctx: DiagnosisContext,
        status: DiagnosisStatus,
        error: str | None = None,
    ) -> None:
        """
        更新诊断状态。
        实际生产环境应写入 diagnosis_run 状态表或 ticket 备注。
        此处为最小实现，仅记录日志；可扩展为写入 harness_ticket.diagnosis_runs。
        """
        # TODO: 接入 harness_ticket.diagnosis_runs 状态表
        pass

    # ------------------------------------------------------------------
    # 内部：事件发布
    # ------------------------------------------------------------------

    async def _publish_event(
        self,
        ctx: DiagnosisContext,
        output: DiagnosisOutput | None,
        diagnosis_id: int | None,
        event_type: str,
    ) -> None:
        if not self.nats:
            return

        payload = {
            "event": event_type,
            "tenant_id": ctx.tenant_id,
            "incident_id": ctx.incident_id,
            "diagnosis_context_id": ctx.diagnosis_context_id,
            "diagnosis_id": diagnosis_id,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if output:
            payload["suspected_root_cause"] = output.suspected_root_cause
            payload["confidence_score"] = output.confidence_score

        subject = f"event.hardware.diagnosis.{event_type.split('.')[-1]}"
        await self.nats.publish(subject, json.dumps(payload).encode())


# ---------------------------------------------------------------------------
# 便利函数：一键诊断
# ---------------------------------------------------------------------------

async def run_diagnosis(
    db_pool: Any,
    nats_client: Any | None,
    extractor: Any,
    analyzer: Any,
    tenant_id: str,
    incident_id: int,
    requested_by_type: str,
    requested_by_id: str,
    ticket_id: str | None = None,
    method: DiagnosisMethod = DiagnosisMethod.rule_based,
    notes: str | None = None,
) -> DiagnosisOutput:
    """
    一键诊断入口。自动创建 context 并执行。
    """
    ctx = DiagnosisContext(
        diagnosis_context_id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        incident_id=incident_id,
        ticket_id=ticket_id,
        requested_by_type=requested_by_type,
        requested_by_id=requested_by_id,
        actor_ref=f"{requested_by_type}:{requested_by_id}",
        method=method,
        notes=notes,
    )
    worker = DiagnosisWorker(db_pool, nats_client, extractor, analyzer)
    return await worker.run(ctx)
