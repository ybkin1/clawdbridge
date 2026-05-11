"""
Hardware Fault API Routes — Harness REST API

改编自 OpenClaw facade 接口
职责：暴露 fault_incidents、fault_graph、diagnosis 的 REST 端点

位置：src/api/hardware_fault.py
Owner: PKG-03 (REST API) + PKG-06 (diagnosis-worker)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

# 假设的 Harness 依赖注入（实际生产环境从 src/lib/auth.py 导入）
# from src.lib.auth import require_auth, get_current_tenant_id

router = APIRouter(prefix="/api/hardware", tags=["hardware_fault"])


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

class FaultIncidentListParams(BaseModel):
    system_asset_id: str | None = None
    component_asset_id: str | None = None
    current_status: str | None = None
    severity: str | None = None
    fault_category: str | None = None
    occurred_from: str | None = None
    occurred_to: str | None = None
    limit: int = Field(50, ge=1, le=500)
    offset: int = Field(0, ge=0)


class DiagnosisRunRequest(BaseModel):
    method: str = "rule_based"  # rule_based | ai_assisted | fallback_rule
    notes: str | None = None


class DiagnosisRunResponse(BaseModel):
    diagnosis_context_id: str
    status: str
    suspected_root_cause: str | None = None
    confidence_score: float | None = None


class FaultGraphResponse(BaseModel):
    incident_id: int
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/fault-incidents")
async def list_fault_incidents(
    request: Request,
    system_asset_id: str | None = None,
    component_asset_id: str | None = None,
    current_status: str | None = None,
    severity: str | None = None,
    fault_category: str | None = None,
    occurred_from: str | None = None,
    occurred_to: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """
    查询故障事件列表。
    支持按系统、组件、状态、严重级别、时间范围过滤。
    RLS 通过 app.current_tenant_id 自动隔离。
    """
    db_pool = request.app.state.db_pool
    tenant_id = request.state.tenant_id  # 由 middleware 注入

    # 字段白名单，防止意外注入
    ALLOWED_FILTERS = {
        "system_asset_id": "system_asset_id",
        "primary_component_asset_id": "primary_component_asset_id",
        "current_status": "current_status",
        "severity": "severity",
        "fault_category": "fault_category",
        "fault_occurred_at": "fault_occurred_at",
    }

    conditions = ["tenant_id = $1"]
    params: list[Any] = [tenant_id]
    param_idx = 2

    if system_asset_id:
        conditions.append(f"{ALLOWED_FILTERS['system_asset_id']} = ${param_idx}")
        params.append(system_asset_id)
        param_idx += 1
    if component_asset_id:
        conditions.append(f"{ALLOWED_FILTERS['primary_component_asset_id']} = ${param_idx}")
        params.append(component_asset_id)
        param_idx += 1
    if current_status:
        conditions.append(f"{ALLOWED_FILTERS['current_status']} = ${param_idx}")
        params.append(current_status)
        param_idx += 1
    if severity:
        conditions.append(f"{ALLOWED_FILTERS['severity']} = ${param_idx}")
        params.append(severity)
        param_idx += 1
    if fault_category:
        conditions.append(f"{ALLOWED_FILTERS['fault_category']} = ${param_idx}")
        params.append(fault_category)
        param_idx += 1
    if occurred_from:
        conditions.append(f"{ALLOWED_FILTERS['fault_occurred_at']} >= ${param_idx}")
        params.append(occurred_from)
        param_idx += 1
    if occurred_to:
        conditions.append(f"{ALLOWED_FILTERS['fault_occurred_at']} < ${param_idx}")
        params.append(occurred_to)
        param_idx += 1

    where_clause = " AND ".join(conditions)

    rows = await db_pool.fetch(
        f"""
        SELECT id, incident_uuid, system_asset_id, primary_component_asset_id,
               fault_occurred_at, detected_at, severity, fault_category,
               fault_name, symptom_text, current_status, created_at
        FROM harness_hardware.fault_incidents
        WHERE {where_clause}
        ORDER BY fault_occurred_at DESC
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """,
        *params, limit, offset,
    )

    total = await db_pool.fetchval(
        f"""
        SELECT COUNT(*) FROM harness_hardware.fault_incidents
        WHERE {where_clause}
        """,
        *params[:-2],  # exclude limit/offset
    )

    return {
        "data": [
            {
                "id": r["id"],
                "incident_uuid": str(r["incident_uuid"]),
                "system_asset_id": str(r["system_asset_id"]),
                "primary_component_asset_id": str(r["primary_component_asset_id"]) if r["primary_component_asset_id"] else None,
                "fault_occurred_at": r["fault_occurred_at"].isoformat() if r["fault_occurred_at"] else None,
                "detected_at": r["detected_at"].isoformat() if r["detected_at"] else None,
                "severity": r["severity"],
                "fault_category": r["fault_category"],
                "fault_name": r["fault_name"],
                "symptom_text": r["symptom_text"],
                "current_status": r["current_status"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ],
        "pagination": {"total": total, "limit": limit, "offset": offset},
    }


@router.get("/fault-incidents/{incident_id}")
async def get_fault_incident(
    request: Request,
    incident_id: int,
) -> dict[str, Any]:
    """获取单个故障事件详情。"""
    db_pool = request.app.state.db_pool
    tenant_id = request.state.tenant_id

    row = await db_pool.fetchrow(
        """
        SELECT *
        FROM harness_hardware.fault_incidents
        WHERE id = $1 AND tenant_id = $2
        """,
        incident_id, tenant_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")

    return {
        "id": row["id"],
        "incident_uuid": str(row["incident_uuid"]),
        "external_ref": row["external_ref"],
        "system_asset_id": str(row["system_asset_id"]),
        "primary_component_asset_id": str(row["primary_component_asset_id"]) if row["primary_component_asset_id"] else None,
        "slot_binding_id": str(row["slot_binding_id"]) if row["slot_binding_id"] else None,
        "incident_source": row["incident_source"],
        "detected_by_type": row["detected_by_type"],
        "fault_occurred_at": row["fault_occurred_at"].isoformat() if row["fault_occurred_at"] else None,
        "severity": row["severity"],
        "fault_category": row["fault_category"],
        "fault_code": row["fault_code"],
        "fault_name": row["fault_name"],
        "symptom_text": row["symptom_text"],
        "current_status": row["current_status"],
        "location_snapshot": row["location_snapshot"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


@router.get("/fault-graph/{incident_id}")
async def get_fault_graph(
    request: Request,
    incident_id: int,
) -> dict[str, Any]:
    """
    获取故障图（可视化数据）。
    返回 cytoscape.js 兼容的 elements 结构。
    """
    tenant_id = request.state.tenant_id
    # 假设 service 已挂载在 app.state
    graph_service = request.app.state.fault_graph_service

    return await graph_service.get_incident_graph(tenant_id, incident_id)


@router.get("/fault-graph/{incident_id}/root-cause")
async def get_root_cause_candidates(
    request: Request,
    incident_id: int,
    max_depth: int = Query(5, ge=1, le=10),
) -> dict[str, Any]:
    """
    获取指定 incident 的根因候选节点。
    """
    tenant_id = request.state.tenant_id
    graph_service = request.app.state.fault_graph_service
    repo = graph_service.repo

    # 先找到 incident 对应的 graph node
    incident_node = await repo.db_pool.fetchrow(
        """
        SELECT id FROM harness_hardware.fault_graph_nodes
        WHERE tenant_id = $1 AND canonical_table = 'harness_hardware.fault_incidents'
          AND canonical_id = $2
        """,
        tenant_id, str(incident_id),
    )
    if not incident_node:
        raise HTTPException(status_code=404, detail="Incident graph node not found")

    candidates = await graph_service.get_root_cause_candidates(
        tenant_id, incident_node["id"], max_depth=max_depth
    )
    return {"incident_id": incident_id, "candidates": candidates}


@router.post("/tickets/{ticket_id}/diagnosis-runs")
async def create_diagnosis_run(
    request: Request,
    ticket_id: str,
    body: DiagnosisRunRequest,
) -> DiagnosisRunResponse:
    """
    为指定工单创建诊断运行。
    提交异步任务到任务队列（Celery/ARQ），立即返回 job_id 用于轮询。
    """
    db_pool = request.app.state.db_pool
    tenant_id = request.state.tenant_id
    user = request.state.user  # 假设 middleware 注入

    incident_id = await db_pool.fetchval(
        """
        SELECT incident_id FROM harness_ticket.tickets
        WHERE id = $1 AND tenant_id = $2
        """,
        ticket_id, tenant_id,
    )
    if not incident_id:
        raise HTTPException(status_code=400, detail="No incident associated with this ticket")

    # 生成诊断上下文 ID
    import uuid
    diagnosis_context_id = str(uuid.uuid4())

    # 提交异步任务（使用 Harness 任务队列封装）
    task_client = getattr(request.app.state, "task_client", None)
    if task_client:
        # 生产环境：提交到 Celery/ARQ
        job = await task_client.enqueue(
            "diagnosis.run",
            tenant_id=tenant_id,
            incident_id=incident_id,
            ticket_id=ticket_id,
            diagnosis_context_id=diagnosis_context_id,
            method=body.method,
            notes=body.notes,
            requested_by_type="user",
            requested_by_id=user["id"],
        )
        return DiagnosisRunResponse(
            diagnosis_context_id=diagnosis_context_id,
            status="queued",
            suspected_root_cause=None,
            confidence_score=None,
        )

    # 降级：无任务队列时直接执行（仅用于开发/测试，有超时保护）
    import asyncio
    from diagnosis_worker import DiagnosisContext, DiagnosisMethod, run_diagnosis

    method = DiagnosisMethod(body.method) if body.method in [m.value for m in DiagnosisMethod] else DiagnosisMethod.rule_based

    try:
        output = await asyncio.wait_for(
            run_diagnosis(
                db_pool=db_pool,
                nats_client=getattr(request.app.state, "nats_client", None),
                extractor=request.app.state.evidence_extractor,
                analyzer=request.app.state.gpu_fault_analyzer,
                tenant_id=tenant_id,
                incident_id=incident_id,
                requested_by_type="user",
                requested_by_id=user["id"],
                ticket_id=ticket_id,
                method=method,
                notes=body.notes,
            ),
            timeout=300,
        )
        return DiagnosisRunResponse(
            diagnosis_context_id=diagnosis_context_id,
            status="completed",
            suspected_root_cause=output.suspected_root_cause,
            confidence_score=output.confidence_score,
        )
    except asyncio.TimeoutError:
        return DiagnosisRunResponse(
            diagnosis_context_id=diagnosis_context_id,
            status="timeout",
            suspected_root_cause=None,
            confidence_score=None,
        )


@router.get("/diagnosis-records/{diagnosis_id}")
async def get_diagnosis_record(
    request: Request,
    diagnosis_id: int,
) -> dict[str, Any]:
    """获取诊断记录详情。"""
    db_pool = request.app.state.db_pool
    tenant_id = request.state.tenant_id

    row = await db_pool.fetchrow(
        """
        SELECT *
        FROM harness_hardware.diagnosis_records
        WHERE id = $1 AND tenant_id = $2
        """,
        diagnosis_id, tenant_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Diagnosis record not found")

    return {
        "id": row["id"],
        "diagnosis_uuid": str(row["diagnosis_uuid"]),
        "incident_id": row["incident_id"],
        "diagnosis_at": row["diagnosis_at"].isoformat() if row["diagnosis_at"] else None,
        "diagnosis_method": row["diagnosis_method"],
        "suspected_root_cause": row["suspected_root_cause"],
        "root_cause_category": row["root_cause_category"],
        "reasoning_summary": row["reasoning_summary"],
        "confidence_score": float(row["confidence_score"]) if row["confidence_score"] else None,
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }
