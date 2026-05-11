"""
Hardware Fault Events — Harness NATS Event Schema

改编自 OpenClaw 事件模型（新增，OpenClaw 无事件系统）
职责：定义硬件故障模块的 NATS 事件格式、发布/消费逻辑

位置：src/modules/hardware/hardware_fault_events.py
Owner: PKG-07 (event integration)
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any


# ---------------------------------------------------------------------------
# Event Schemas
# ---------------------------------------------------------------------------

@dataclass
class FaultEvent:
    """事件基类"""
    event_type: str
    tenant_id: str
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    snapshot_ref: str | None = None  # Harness 规范：事件只携带 snapshot_ref


@dataclass
class FaultIncidentDetected(FaultEvent):
    """新故障事件被检测到"""
    incident_id: int
    incident_uuid: str
    system_asset_id: str
    severity: str
    fault_category: str
    fault_name: str
    occurred_at: str


@dataclass
class FaultIncidentAcknowledged(FaultEvent):
    """故障事件被人工确认"""
    incident_id: int
    incident_uuid: str
    acknowledged_by_type: str
    acknowledged_by_id: str
    acknowledged_at: str


@dataclass
class DiagnosisCompleted(FaultEvent):
    """诊断运行完成"""
    diagnosis_context_id: str
    diagnosis_id: int
    incident_id: int
    suspected_root_cause: str
    confidence_score: float
    method: str


@dataclass
class DiagnosisFailed(FaultEvent):
    """诊断运行失败"""
    diagnosis_context_id: str
    incident_id: int
    error: str


@dataclass
class RepairActionExecuted(FaultEvent):
    """维修动作执行"""
    action_id: int
    action_uuid: str
    incident_id: int
    action_type: str
    action_status: str
    executed_at: str
    actor_type: str
    actor_id: str


@dataclass
class VerificationCheckCompleted(FaultEvent):
    """验证检查完成"""
    check_id: int
    check_uuid: str
    incident_id: int
    action_id: int | None
    pass_flag: bool
    executed_at: str


@dataclass
class IncidentResultConcluded(FaultEvent):
    """故障事件被结案"""
    result_id: int
    result_uuid: str
    incident_id: int
    conclusion_code: str
    root_cause_confirmed: bool
    final_root_cause: str
    concluded_at: str


# ---------------------------------------------------------------------------
# Publisher
# ---------------------------------------------------------------------------

class FaultEventPublisher:
    """
    硬件故障事件发布器。
    所有事件发布到 `event.hardware.{action}` subject。
    """

    SUBJECT_PREFIX = "event.hardware"

    def __init__(self, nats_client: Any | None):
        self.nats = nats_client

    async def publish(self, event: FaultEvent) -> None:
        if not self.nats:
            return

        subject = f"{self.SUBJECT_PREFIX}.{self._event_to_subject(event)}"
        payload = json.dumps(asdict(event), default=str).encode()
        await self.nats.publish(subject, payload)

    def _event_to_subject(self, event: FaultEvent) -> str:
        mapping = {
            "fault.incident.detected": "fault.detected",
            "fault.incident.acknowledged": "fault.acknowledged",
            "diagnosis.completed": "diagnosis.completed",
            "diagnosis.failed": "diagnosis.failed",
            "repair.executed": "repair.executed",
            "verification.completed": "verification.completed",
            "incident.concluded": "incident.concluded",
        }
        return mapping.get(event.event_type, "unknown")

    # 便捷方法
    async def fault_detected(self, ev: FaultIncidentDetected) -> None:
        await self.publish(ev)

    async def diagnosis_completed(self, ev: DiagnosisCompleted) -> None:
        await self.publish(ev)

    async def diagnosis_failed(self, ev: DiagnosisFailed) -> None:
        await self.publish(ev)

    async def repair_executed(self, ev: RepairActionExecuted) -> None:
        await self.publish(ev)

    async def verification_completed(self, ev: VerificationCheckCompleted) -> None:
        await self.publish(ev)

    async def incident_concluded(self, ev: IncidentResultConcluded) -> None:
        await self.publish(ev)


# ---------------------------------------------------------------------------
# Consumer Handlers
# ---------------------------------------------------------------------------

class FaultEventConsumer:
    """
    硬件故障事件消费者。
    订阅相关 subject，触发下游动作（如通知、仪表板更新、知识沉淀）。
    """

    def __init__(self, db_pool: Any, nats_client: Any | None):
        self.db_pool = db_pool
        self.nats = nats_client

    async def subscribe(self) -> None:
        if not self.nats:
            return

        await self.nats.subscribe("event.hardware.>", cb=self._on_message)

    async def _on_message(self, msg: Any) -> None:
        subject = msg.subject
        data = json.loads(msg.data.decode())

        handler = getattr(self, f"_handle_{subject.replace('.', '_')}", None)
        if handler:
            await handler(data)
        else:
            # 通用处理：记录审计日志
            await self._audit_log(subject, data)

    async def _handle_event_hardware_fault_detected(self, data: dict[str, Any]) -> None:
        """故障检测：创建通知、更新仪表板"""
        # TODO: 接入通知中心（如发送邮件/钉钉给值班人员）
        pass

    async def _handle_event_hardware_diagnosis_completed(self, data: dict[str, Any]) -> None:
        """诊断完成：更新 ticket 状态、触发知识沉淀候选"""
        # TODO: 自动更新关联 ticket 的诊断结果摘要
        # TODO: 触发 knowledge_candidate 评估（KN-06）
        pass

    async def _handle_event_hardware_repair_executed(self, data: dict[str, Any]) -> None:
        """维修执行：记录变更、触发验证检查"""
        # TODO: 自动创建 verification_check 记录
        pass

    async def _handle_event_hardware_incident_concluded(self, data: dict[str, Any]) -> None:
        """事件结案：归档、生成最终报告"""
        # TODO: 触发 report_gen 生成结案报告（BA-05）
        pass

    async def _audit_log(self, subject: str, data: dict[str, Any]) -> None:
        """通用审计日志记录"""
        # TODO: 写入 harness_audit.audit_logs
        pass
