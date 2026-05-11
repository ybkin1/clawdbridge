"""
Fault Graph Service — Harness 硬件模块

改编自 OpenClaw FaultGraphAggregateReader
职责：提供高层图操作 API（构建、查询、聚合），供 REST API / MCP / Worker 调用

位置：src/modules/hardware/fault_graph_service.py
Owner: PKG-06 (diagnosis-worker)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from fault_graph_repository import FaultGraphRepository, GraphNode, GraphEdge, TraversalStep


# ---------------------------------------------------------------------------
# 数据类
# ---------------------------------------------------------------------------

@dataclass
class GraphBuildResult:
    incident_id: int
    nodes_created: int
    edges_created: int
    node_ids: list[int]
    edge_ids: list[int]


@dataclass
class GraphPath:
    start_node_id: int
    end_node_id: int
    path_node_ids: list[int]
    edges: list[GraphEdge]
    total_confidence: float


@dataclass
class AggregateStats:
    total_nodes: int
    total_edges: int
    nodes_by_type: dict[str, int]
    edges_by_type: dict[str, int]
    top_components: list[dict[str, Any]]
    orphan_nodes: int


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class FaultGraphService:
    """
    Fault Graph 服务层。
    封装 Repository，提供业务语义方法（构建图、查询路径、聚合统计）。
    """

    def __init__(self, repo: FaultGraphRepository):
        self.repo = repo

    # ------------------------------------------------------------------
    # Graph Building
    # ------------------------------------------------------------------

    async def build_from_incident(
        self,
        tenant_id: str,
        incident_id: int,
        system_asset_id: str,
        primary_component_asset_id: str | None,
        slot_binding_id: str | None,
        diagnosis_id: int | None,
        evidences: list[dict[str, Any]] | None = None,
    ) -> GraphBuildResult:
        """
        基于 incident 及其关联数据构建 fault graph 投影。
        创建节点：incident, system, component, slot, diagnosis, evidence...
        创建边：incident → system → component → diagnosis 等
        """
        node_ids: list[int] = []
        edge_ids: list[int] = []

        # 1. Incident node
        inc_node = await self.repo.upsert_node(
            tenant_id=tenant_id,
            node_type="incident",
            canonical_table="harness_hardware.fault_incidents",
            canonical_id=str(incident_id),
            display_name=f"Incident #{incident_id}",
            node_props={"incident_id": incident_id},
        )
        node_ids.append(inc_node)

        # 2. System asset node
        sys_node = await self.repo.upsert_node(
            tenant_id=tenant_id,
            node_type="system_asset",
            canonical_table="harness_assets.asset_registry",
            canonical_id=system_asset_id,
            display_name=f"System {system_asset_id[:8]}...",
            node_props={"asset_id": system_asset_id},
        )
        node_ids.append(sys_node)
        e1 = await self.repo.insert_edge(
            tenant_id, "affects", sys_node, inc_node, incident_id=incident_id,
            provenance_json={"build_reason": "incident_system_relation"},
        )
        if e1:
            edge_ids.append(e1)

        # 3. Primary component node
        if primary_component_asset_id:
            comp_node = await self.repo.upsert_node(
                tenant_id=tenant_id,
                node_type="component_asset",
                canonical_table="harness_assets.asset_registry",
                canonical_id=primary_component_asset_id,
                display_name=f"Component {primary_component_asset_id[:8]}...",
                node_props={"asset_id": primary_component_asset_id},
            )
            node_ids.append(comp_node)
            e2 = await self.repo.insert_edge(
                tenant_id, "belongs_to", comp_node, sys_node, incident_id=incident_id,
                provenance_json={"build_reason": "component_system_relation"},
            )
            if e2:
                edge_ids.append(e2)
            e3 = await self.repo.insert_edge(
                tenant_id, "affects", comp_node, inc_node, incident_id=incident_id,
                provenance_json={"build_reason": "incident_component_relation"},
            )
            if e3:
                edge_ids.append(e3)

        # 4. Slot binding node
        if slot_binding_id:
            slot_node = await self.repo.upsert_node(
                tenant_id=tenant_id,
                node_type="slot_binding",
                canonical_table="harness_hardware.slot_bindings",
                canonical_id=slot_binding_id,
                display_name=f"Slot {slot_binding_id[:8]}...",
                node_props={"slot_binding_id": slot_binding_id},
            )
            node_ids.append(slot_node)
            e4 = await self.repo.insert_edge(
                tenant_id, "mounted_in", slot_node, comp_node or sys_node,
                incident_id=incident_id,
                provenance_json={"build_reason": "slot_component_relation"},
            )
            if e4:
                edge_ids.append(e4)

        # 5. Diagnosis node
        if diagnosis_id:
            diag_node = await self.repo.upsert_node(
                tenant_id=tenant_id,
                node_type="diagnosis",
                canonical_table="harness_hardware.diagnosis_records",
                canonical_id=str(diagnosis_id),
                display_name=f"Diagnosis #{diagnosis_id}",
                node_props={"diagnosis_id": diagnosis_id},
            )
            node_ids.append(diag_node)
            e5 = await self.repo.insert_edge(
                tenant_id, "diagnoses", diag_node, inc_node, incident_id=incident_id,
                provenance_json={"build_reason": "diagnosis_incident_relation"},
            )
            if e5:
                edge_ids.append(e5)

        # 6. Evidence nodes
        if evidences:
            for ev in evidences:
                ev_id = ev.get("id")
                if not ev_id:
                    continue
                ev_node = await self.repo.upsert_node(
                    tenant_id=tenant_id,
                    node_type="evidence",
                    canonical_table="harness_hardware.fault_evidences",
                    canonical_id=str(ev_id),
                    display_name=f"Evidence {ev_id}",
                    node_props={"evidence_type": ev.get("evidence_type")},
                )
                node_ids.append(ev_node)
                e6 = await self.repo.insert_edge(
                    tenant_id, "supports", ev_node, inc_node, incident_id=incident_id,
                    evidence_id=ev_id,
                    provenance_json={"build_reason": "evidence_incident_relation"},
                )
                if e6:
                    edge_ids.append(e6)

        return GraphBuildResult(
            incident_id=incident_id,
            nodes_created=len(node_ids),
            edges_created=len(edge_ids),
            node_ids=node_ids,
            edge_ids=edge_ids,
        )

    # ------------------------------------------------------------------
    # Query APIs
    # ------------------------------------------------------------------

    async def get_impact_paths(
        self,
        tenant_id: str,
        start_node_id: int,
        edge_types: list[str] | None = None,
        max_depth: int = 5,
    ) -> list[GraphPath]:
        """
        获取从 start_node 出发的所有影响路径（后代遍历）。
        返回每条路径的节点序列和边序列。
        """
        paths: list[GraphPath] = []
        current_path_nodes: list[int] = [start_node_id]
        current_path_edges: list[GraphEdge] = []

        async for step in self.repo.traverse_descendants(
            tenant_id, start_node_id, edge_types, max_depth
        ):
            if step.depth == 0:
                continue
            # 简化：仅记录从起点到当前节点的单一路径
            # 生产环境可用路径重建算法
            if len(step.path) >= 2:
                confidence = 1.0
                if step.edge and step.edge.confidence_score:
                    confidence = step.edge.confidence_score
                paths.append(GraphPath(
                    start_node_id=start_node_id,
                    end_node_id=step.node.id,
                    path_node_ids=step.path,
                    edges=[step.edge] if step.edge else [],
                    total_confidence=confidence,
                ))
        return paths

    async def get_root_cause_candidates(
        self,
        tenant_id: str,
        incident_node_id: int,
        max_depth: int = 5,
    ) -> list[dict[str, Any]]:
        """
        从 incident 节点反向遍历，寻找可能的根因节点。
        返回按置信度排序的候选列表。
        """
        candidates: list[dict[str, Any]] = []
        async for step in self.repo.traverse_ancestors(
            tenant_id, incident_node_id, max_depth=max_depth
        ):
            if step.depth == 0:
                continue
            degree = await self.repo.get_node_degrees(tenant_id, step.node.id)
            candidates.append({
                "node_id": step.node.id,
                "node_type": step.node.node_type,
                "display_name": step.node.display_name,
                "canonical_table": step.node.canonical_table,
                "canonical_id": step.node.canonical_id,
                "depth": step.depth,
                "path": step.path,
                "in_degree": degree.get("in_degree", 0),
                "out_degree": degree.get("out_degree", 0),
                "confidence": step.edge.confidence_score if step.edge else None,
            })

        # 按深度升序、入度降序排序（浅层、高入度更可能是根因）
        candidates.sort(key=lambda c: (c["depth"], -c["in_degree"]))
        return candidates

    # ------------------------------------------------------------------
    # Aggregate APIs
    # ------------------------------------------------------------------

    async def get_aggregate_stats(self, tenant_id: str) -> AggregateStats:
        """返回 tenant 级别的图统计信息。"""
        pool = self.repo.db_pool

        node_type_rows = await pool.fetch(
            """
            SELECT node_type, COUNT(*) AS cnt
            FROM harness_hardware.fault_graph_nodes
            WHERE tenant_id = $1
            GROUP BY node_type
            """,
            tenant_id,
        )
        edge_type_rows = await pool.fetch(
            """
            SELECT edge_type, COUNT(*) AS cnt
            FROM harness_hardware.fault_graph_edges
            WHERE tenant_id = $1 AND is_active = TRUE
            GROUP BY edge_type
            """,
            tenant_id,
        )
        total_nodes = await pool.fetchval(
            "SELECT COUNT(*) FROM harness_hardware.fault_graph_nodes WHERE tenant_id = $1",
            tenant_id,
        )
        total_edges = await pool.fetchval(
            "SELECT COUNT(*) FROM harness_hardware.fault_graph_edges WHERE tenant_id = $1 AND is_active = TRUE",
            tenant_id,
        )
        orphan_nodes = await pool.fetchval(
            """
            SELECT COUNT(*)
            FROM harness_hardware.fault_graph_nodes n
            WHERE n.tenant_id = $1
              AND NOT EXISTS (
                  SELECT 1 FROM harness_hardware.fault_graph_edges e
                  WHERE e.src_graph_node_id = n.id OR e.dst_graph_node_id = n.id
              )
            """,
            tenant_id,
        )
        top_components = await pool.fetch(
            """
            SELECT n.canonical_id, n.display_name, COUNT(e.id) AS edge_count
            FROM harness_hardware.fault_graph_nodes n
            LEFT JOIN harness_hardware.fault_graph_edges e
                ON n.id = e.src_graph_node_id OR n.id = e.dst_graph_node_id
            WHERE n.tenant_id = $1 AND n.node_type = 'component_asset'
            GROUP BY n.id
            ORDER BY edge_count DESC
            LIMIT 10
            """,
            tenant_id,
        )

        return AggregateStats(
            total_nodes=total_nodes or 0,
            total_edges=total_edges or 0,
            nodes_by_type={r["node_type"]: r["cnt"] for r in node_type_rows},
            edges_by_type={r["edge_type"]: r["cnt"] for r in edge_type_rows},
            top_components=[
                {"canonical_id": r["canonical_id"], "display_name": r["display_name"], "edge_count": r["edge_count"]}
                for r in top_components
            ],
            orphan_nodes=orphan_nodes or 0,
        )

    async def get_incident_graph(
        self, tenant_id: str, incident_id: int
    ) -> dict[str, Any]:
        """
        获取完整 incident 子图，供前端可视化或 MCP 查询。
        返回 cytoscape.js 兼容格式。
        """
        raw = await self.repo.get_incident_subgraph(tenant_id, incident_id)
        return {
            "elements": {
                "nodes": [
                    {
                        "data": {
                            "id": str(n["id"]),
                            "label": n["display_name"],
                            "type": n["type"],
                            "canonical_id": n["canonical_id"],
                            **n["props"],
                        }
                    }
                    for n in raw["nodes"]
                ],
                "edges": [
                    {
                        "data": {
                            "id": str(e["id"]),
                            "source": str(e["source"]),
                            "target": str(e["target"]),
                            "label": e["type"],
                            "confidence": e["confidence"],
                            **e["provenance"],
                        }
                    }
                    for e in raw["edges"]
                ],
            },
            "incident_id": incident_id,
            "tenant_id": tenant_id,
        }
