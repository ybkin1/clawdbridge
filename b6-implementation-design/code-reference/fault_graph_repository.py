"""
Fault Graph Repository — Harness 硬件模块

改编自 OpenClaw SqlFaultGraphDialect + PostgresFaultGraphDialect
职责：封装 fault_graph_nodes / fault_graph_edges 的 SQL 操作，提供 CTE 图遍历

位置：src/modules/hardware/fault_graph_repository.py
Owner: PKG-06 (diagnosis-worker)
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, AsyncIterator


# ---------------------------------------------------------------------------
# 数据类
# ---------------------------------------------------------------------------

@dataclass
class GraphNode:
    id: int
    graph_node_uuid: str
    node_type: str
    canonical_table: str
    canonical_id: str
    display_name: str
    node_props: dict[str, Any]
    tenant_id: str


@dataclass
class GraphEdge:
    id: int
    graph_edge_uuid: str
    edge_type: str
    src_graph_node_id: int
    dst_graph_node_id: int
    incident_id: int | None
    evidence_id: int | None
    confidence_score: float | None
    provenance_json: dict[str, Any]
    is_active: bool
    tenant_id: str


@dataclass
class TraversalStep:
    depth: int
    node: GraphNode
    edge: GraphEdge | None
    path: list[int]  # node ids from start to current


# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------

class FaultGraphRepository:
    """
    Fault Graph 数据访问层。
    所有方法使用 asyncpg 参数化查询，避免 SQL 注入。
    """

    def __init__(self, db_pool: Any):  # asyncpg.Pool
        self.db_pool = db_pool

    # ------------------------------------------------------------------
    # Node CRUD
    # ------------------------------------------------------------------

    async def upsert_node(
        self,
        tenant_id: str,
        node_type: str,
        canonical_table: str,
        canonical_id: str,
        display_name: str,
        node_props: dict[str, Any] | None = None,
        source_version: str = "1.0",
    ) -> int:
        """
        插入或更新 graph node（按 tenant_id + canonical_table + canonical_id 唯一）。
        返回 node id。
        """
        row = await self.db_pool.fetchrow(
            """
            INSERT INTO harness_hardware.fault_graph_nodes (
                tenant_id, node_type, canonical_table, canonical_id,
                display_name, node_props, source_version, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (tenant_id, canonical_table, canonical_id)
            DO UPDATE SET
                node_type = EXCLUDED.node_type,
                display_name = EXCLUDED.display_name,
                node_props = EXCLUDED.node_props,
                source_version = EXCLUDED.source_version,
                updated_at = NOW()
            RETURNING id
            """,
            tenant_id, node_type, canonical_table, canonical_id,
            display_name, json.dumps(node_props or {}), source_version,
        )
        return row["id"]

    async def get_node_by_id(self, node_id: int, tenant_id: str) -> GraphNode | None:
        row = await self.db_pool.fetchrow(
            """
            SELECT id, graph_node_uuid, node_type, canonical_table, canonical_id,
                   display_name, node_props, tenant_id
            FROM harness_hardware.fault_graph_nodes
            WHERE id = $1 AND tenant_id = $2
            """,
            node_id, tenant_id,
        )
        if not row:
            return None
        return GraphNode(
            id=row["id"],
            graph_node_uuid=str(row["graph_node_uuid"]),
            node_type=row["node_type"],
            canonical_table=row["canonical_table"],
            canonical_id=row["canonical_id"],
            display_name=row["display_name"],
            node_props=row["node_props"] or {},
            tenant_id=str(row["tenant_id"]),
        )

    async def get_nodes_by_type(
        self, tenant_id: str, node_type: str, limit: int = 100
    ) -> list[GraphNode]:
        rows = await self.db_pool.fetch(
            """
            SELECT id, graph_node_uuid, node_type, canonical_table, canonical_id,
                   display_name, node_props, tenant_id
            FROM harness_hardware.fault_graph_nodes
            WHERE tenant_id = $1 AND node_type = $2
            LIMIT $3
            """,
            tenant_id, node_type, limit,
        )
        return [
            GraphNode(
                id=r["id"],
                graph_node_uuid=str(r["graph_node_uuid"]),
                node_type=r["node_type"],
                canonical_table=r["canonical_table"],
                canonical_id=r["canonical_id"],
                display_name=r["display_name"],
                node_props=r["node_props"] or {},
                tenant_id=str(r["tenant_id"]),
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Edge CRUD
    # ------------------------------------------------------------------

    async def insert_edge(
        self,
        tenant_id: str,
        edge_type: str,
        src_graph_node_id: int,
        dst_graph_node_id: int,
        incident_id: int | None = None,
        evidence_id: int | None = None,
        confidence_score: float | None = None,
        provenance_json: dict[str, Any] | None = None,
    ) -> int:
        row = await self.db_pool.fetchrow(
            """
            INSERT INTO harness_hardware.fault_graph_edges (
                tenant_id, edge_type, src_graph_node_id, dst_graph_node_id,
                incident_id, evidence_id, confidence_score, provenance_json
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT DO NOTHING
            RETURNING id
            """,
            tenant_id, edge_type, src_graph_node_id, dst_graph_node_id,
            incident_id, evidence_id, confidence_score,
            json.dumps(provenance_json or {}),
        )
        return row["id"] if row else 0

    async def get_edges_from_node(
        self, tenant_id: str, src_node_id: int, edge_type: str | None = None
    ) -> list[GraphEdge]:
        sql = """
            SELECT id, graph_edge_uuid, edge_type, src_graph_node_id, dst_graph_node_id,
                   incident_id, evidence_id, confidence_score, provenance_json, is_active, tenant_id
            FROM harness_hardware.fault_graph_edges
            WHERE tenant_id = $1 AND src_graph_node_id = $2 AND is_active = TRUE
        """
        params: list[Any] = [tenant_id, src_node_id]
        if edge_type:
            sql += " AND edge_type = $3"
            params.append(edge_type)
        rows = await self.db_pool.fetch(sql, *params)
        return [self._row_to_edge(r) for r in rows]

    async def get_edges_to_node(
        self, tenant_id: str, dst_node_id: int, edge_type: str | None = None
    ) -> list[GraphEdge]:
        sql = """
            SELECT id, graph_edge_uuid, edge_type, src_graph_node_id, dst_graph_node_id,
                   incident_id, evidence_id, confidence_score, provenance_json, is_active, tenant_id
            FROM harness_hardware.fault_graph_edges
            WHERE tenant_id = $1 AND dst_graph_node_id = $2 AND is_active = TRUE
        """
        params: list[Any] = [tenant_id, dst_node_id]
        if edge_type:
            sql += " AND edge_type = $3"
            params.append(edge_type)
        rows = await self.db_pool.fetch(sql, *params)
        return [self._row_to_edge(r) for r in rows]

    # ------------------------------------------------------------------
    # CTE Traversal
    # ------------------------------------------------------------------

    async def traverse_descendants(
        self,
        tenant_id: str,
        start_node_id: int,
        edge_types: list[str] | None = None,
        max_depth: int = 5,
    ) -> AsyncIterator[TraversalStep]:
        """
        从 start_node 出发，沿出边遍历后代节点（BFS）。
        返回每一步的节点、边、路径。
        """
        type_filter = ""
        params: list[Any] = [tenant_id, start_node_id, max_depth]
        if edge_types:
            type_filter = " AND e.edge_type = ANY($4)"
            params.append(edge_types)

        rows = await self.db_pool.fetch(
            f"""
            WITH RECURSIVE traversal AS (
                -- 起点
                SELECT
                    n.id AS node_id,
                    0 AS depth,
                    ARRAY[n.id] AS path,
                    NULL::bigint AS edge_id
                FROM harness_hardware.fault_graph_nodes n
                WHERE n.id = $2 AND n.tenant_id = $1

                UNION ALL

                -- 递归扩展
                SELECT
                    e.dst_graph_node_id AS node_id,
                    t.depth + 1,
                    t.path || e.dst_graph_node_id,
                    e.id
                FROM traversal t
                JOIN harness_hardware.fault_graph_edges e
                    ON e.src_graph_node_id = t.node_id
                WHERE e.tenant_id = $1
                  AND e.is_active = TRUE
                  AND t.depth < $3
                  AND NOT e.dst_graph_node_id = ANY(t.path)  -- 避免环路
                  {type_filter}
            )
            SELECT
                t.depth,
                t.path,
                t.edge_id,
                n.id, n.graph_node_uuid, n.node_type, n.canonical_table,
                n.canonical_id, n.display_name, n.node_props,
                e.id AS eid, e.graph_edge_uuid, e.edge_type, e.src_graph_node_id,
                e.dst_graph_node_id, e.incident_id, e.evidence_id,
                e.confidence_score, e.provenance_json
            FROM traversal t
            JOIN harness_hardware.fault_graph_nodes n ON n.id = t.node_id
            LEFT JOIN harness_hardware.fault_graph_edges e ON e.id = t.edge_id
            ORDER BY t.depth, t.path
            """,
            *params,
        )

        for r in rows:
            yield TraversalStep(
                depth=r["depth"],
                node=GraphNode(
                    id=r["id"],
                    graph_node_uuid=str(r["graph_node_uuid"]),
                    node_type=r["node_type"],
                    canonical_table=r["canonical_table"],
                    canonical_id=r["canonical_id"],
                    display_name=r["display_name"],
                    node_props=r["node_props"] or {},
                    tenant_id=tenant_id,
                ),
                edge=self._row_to_edge(r, prefix="e") if r["eid"] else None,
                path=r["path"],
            )

    async def traverse_ancestors(
        self,
        tenant_id: str,
        start_node_id: int,
        edge_types: list[str] | None = None,
        max_depth: int = 5,
    ) -> AsyncIterator[TraversalStep]:
        """
        从 start_node 出发，沿入边遍历祖先节点（反向 BFS）。
        """
        type_filter = ""
        params: list[Any] = [tenant_id, start_node_id, max_depth]
        if edge_types:
            type_filter = " AND e.edge_type = ANY($4)"
            params.append(edge_types)

        rows = await self.db_pool.fetch(
            f"""
            WITH RECURSIVE traversal AS (
                SELECT
                    n.id AS node_id,
                    0 AS depth,
                    ARRAY[n.id] AS path,
                    NULL::bigint AS edge_id
                FROM harness_hardware.fault_graph_nodes n
                WHERE n.id = $2 AND n.tenant_id = $1

                UNION ALL

                SELECT
                    e.src_graph_node_id AS node_id,
                    t.depth + 1,
                    t.path || e.src_graph_node_id,
                    e.id
                FROM traversal t
                JOIN harness_hardware.fault_graph_edges e
                    ON e.dst_graph_node_id = t.node_id
                WHERE e.tenant_id = $1
                  AND e.is_active = TRUE
                  AND t.depth < $3
                  AND NOT e.src_graph_node_id = ANY(t.path)
                  {type_filter}
            )
            SELECT
                t.depth,
                t.path,
                t.edge_id,
                n.id, n.graph_node_uuid, n.node_type, n.canonical_table,
                n.canonical_id, n.display_name, n.node_props,
                e.id AS eid, e.graph_edge_uuid, e.edge_type, e.src_graph_node_id,
                e.dst_graph_node_id, e.incident_id, e.evidence_id,
                e.confidence_score, e.provenance_json
            FROM traversal t
            JOIN harness_hardware.fault_graph_nodes n ON n.id = t.node_id
            LEFT JOIN harness_hardware.fault_graph_edges e ON e.id = t.edge_id
            ORDER BY t.depth, t.path
            """,
            *params,
        )

        for r in rows:
            yield TraversalStep(
                depth=r["depth"],
                node=GraphNode(
                    id=r["id"],
                    graph_node_uuid=str(r["graph_node_uuid"]),
                    node_type=r["node_type"],
                    canonical_table=r["canonical_table"],
                    canonical_id=r["canonical_id"],
                    display_name=r["display_name"],
                    node_props=r["node_props"] or {},
                    tenant_id=tenant_id,
                ),
                edge=self._row_to_edge(r, prefix="e") if r["eid"] else None,
                path=r["path"],
            )

    # ------------------------------------------------------------------
    # Aggregate Queries
    # ------------------------------------------------------------------

    async def get_node_degrees(
        self, tenant_id: str, node_id: int
    ) -> dict[str, Any]:
        """返回节点的入度、出度、关联事件数。"""
        row = await self.db_pool.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE src_graph_node_id = $2) AS out_degree,
                COUNT(*) FILTER (WHERE dst_graph_node_id = $2) AS in_degree,
                COUNT(DISTINCT incident_id) AS incident_count
            FROM harness_hardware.fault_graph_edges
            WHERE tenant_id = $1 AND is_active = TRUE
              AND ($2 IN (src_graph_node_id, dst_graph_node_id))
            """,
            tenant_id, node_id,
        )
        return dict(row) if row else {"out_degree": 0, "in_degree": 0, "incident_count": 0}

    async def get_incident_subgraph(
        self, tenant_id: str, incident_id: int
    ) -> dict[str, Any]:
        """
        获取与特定 incident 关联的子图（所有节点和边）。
        返回 {nodes: [...], edges: [...]} 结构。
        """
        node_rows = await self.db_pool.fetch(
            """
            SELECT DISTINCT
                n.id, n.graph_node_uuid, n.node_type, n.canonical_table,
                n.canonical_id, n.display_name, n.node_props
            FROM harness_hardware.fault_graph_nodes n
            JOIN harness_hardware.fault_graph_edges e
                ON n.id = e.src_graph_node_id OR n.id = e.dst_graph_node_id
            WHERE e.tenant_id = $1 AND e.incident_id = $2 AND e.is_active = TRUE
            """,
            tenant_id, incident_id,
        )
        edge_rows = await self.db_pool.fetch(
            """
            SELECT id, graph_edge_uuid, edge_type, src_graph_node_id, dst_graph_node_id,
                   incident_id, evidence_id, confidence_score, provenance_json
            FROM harness_hardware.fault_graph_edges
            WHERE tenant_id = $1 AND incident_id = $2 AND is_active = TRUE
            """,
            tenant_id, incident_id,
        )
        return {
            "nodes": [
                {
                    "id": r["id"],
                    "uuid": str(r["graph_node_uuid"]),
                    "type": r["node_type"],
                    "canonical_table": r["canonical_table"],
                    "canonical_id": r["canonical_id"],
                    "display_name": r["display_name"],
                    "props": r["node_props"] or {},
                }
                for r in node_rows
            ],
            "edges": [
                {
                    "id": r["id"],
                    "uuid": str(r["graph_edge_uuid"]),
                    "type": r["edge_type"],
                    "source": r["src_graph_node_id"],
                    "target": r["dst_graph_node_id"],
                    "incident_id": r["incident_id"],
                    "evidence_id": r["evidence_id"],
                    "confidence": float(r["confidence_score"]) if r["confidence_score"] else None,
                    "provenance": r["provenance_json"] or {},
                }
                for r in edge_rows
            ],
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _row_to_edge(self, r: Any, prefix: str = "") -> GraphEdge:
        p = prefix + "_" if prefix else ""
        return GraphEdge(
            id=r[f"{p}id"],
            graph_edge_uuid=str(r[f"{p}graph_edge_uuid"]),
            edge_type=r[f"{p}edge_type"],
            src_graph_node_id=r[f"{p}src_graph_node_id"],
            dst_graph_node_id=r[f"{p}dst_graph_node_id"],
            incident_id=r[f"{p}incident_id"],
            evidence_id=r[f"{p}evidence_id"],
            confidence_score=float(r[f"{p}confidence_score"]) if r[f"{p}confidence_score"] else None,
            provenance_json=r[f"{p}provenance_json"] or {},
            is_active=True,
            tenant_id=str(r["tenant_id"]),
        )
