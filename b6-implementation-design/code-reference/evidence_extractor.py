"""
Evidence Extractor — Harness 诊断模块

改编自 OpenClaw build_evidence_summary.py + extract_later_key_info_fast.py
职责：从 file_server manifest 或 fault_evidences 提取原始日志，转换为分析器输入流

位置：src/modules/ticket/diagnosis/evidence_extractor.py
Owner: PKG-06 (diagnosis-worker)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, AsyncIterator

import aiohttp


# ---------------------------------------------------------------------------
# 数据类
# ---------------------------------------------------------------------------

@dataclass
class EvidenceStream:
    """分析器输入流单元"""
    source_type: str          # 'file_server' | 'database_raw' | 'inline_text'
    source_uri: str | None
    evidence_id: str | None   # fault_evidences.id
    content_hash: str
    line_stream: AsyncIterator[str]
    meta: dict[str, Any]


@dataclass
class ExtractedEvidence:
    """提取后的结构化证据（写入 fault_evidences 前或补充分析后）"""
    evidence_type: str
    observed_at: datetime
    source_system: str
    source_uri: str | None
    message_id: str | None
    metric_name: str | None
    metric_value_json: dict[str, Any] | None
    summary_text: str
    checksum: str
    dedupe_key: str
    raw_payload_ref: str | None
    tenant_id: str
    incident_id: int | None
    incident_occurred_at: datetime | None


# ---------------------------------------------------------------------------
# 核心提取器
# ---------------------------------------------------------------------------

class EvidenceExtractor:
    """
    从多种来源提取故障证据，转换为 GpuFaultAnalyzer 可消费的文本流。

    用法：
        extractor = EvidenceExtractor(file_server_base_url="http://fs:8080")
        async for stream in extractor.from_incident(db_pool, incident_id, tenant_id):
            result = await analyzer.analyze_text_stream(stream.line_stream, ...)
    """

    def __init__(
        self,
        file_server_base_url: str | None = None,
        chunk_size: int = 8192,
    ):
        self.file_server_base_url = file_server_base_url
        self.chunk_size = chunk_size

    # ------------------------------------------------------------------
    # 公开 API：按 incident 批量提取
    # ------------------------------------------------------------------

    async def from_incident(
        self,
        db_pool: Any,  # asyncpg.Pool
        incident_id: int,
        tenant_id: str,
    ) -> AsyncIterator[EvidenceStream]:
        """
        从数据库读取 fault_evidences，按 raw_payload_ref 解析出文本流。
        每条 evidence 可能包含一个日志文件引用或内联文本。
        """
        rows = await db_pool.fetch(
            """
            SELECT id, evidence_type, source_uri, raw_payload_ref,
                   summary_text, observed_at, source_system
            FROM harness_hardware.fault_evidences
            WHERE incident_id = $1 AND tenant_id = $2
            ORDER BY observed_at ASC
            """,
            incident_id, tenant_id,
        )

        for row in rows:
            stream = await self._resolve_stream(row, tenant_id)
            if stream:
                yield stream

    async def from_manifest(
        self,
        manifest: dict[str, Any],
        tenant_id: str,
    ) -> AsyncIterator[EvidenceStream]:
        """
        从 file_server manifest 提取。manifest 格式：
        {
          "files": [
            {"uri": "/logs/nvidia-bug-report.log.gz", "type": "nvidia_bug_report", "hash": "sha256:abc..."},
            ...
          ]
        }
        """
        for item in manifest.get("files", []):
            uri = item.get("uri")
            file_type = item.get("type", "unknown")
            content_hash = item.get("hash", "")
            if not uri:
                continue

            line_stream = self._fetch_file_lines(uri)
            yield EvidenceStream(
                source_type="file_server",
                source_uri=uri,
                evidence_id=None,
                content_hash=content_hash,
                line_stream=line_stream,
                meta={"manifest_item": item, "file_type": file_type, "tenant_id": tenant_id},
            )

    async def from_inline_text(
        self,
        text: str,
        evidence_id: str | None,
        tenant_id: str,
        meta: dict[str, Any] | None = None,
    ) -> EvidenceStream:
        """直接传入内联文本（如从 chat 粘贴的小段日志）。"""
        content_hash = hashlib.sha256(text.encode()).hexdigest()
        return EvidenceStream(
            source_type="inline_text",
            source_uri=None,
            evidence_id=evidence_id,
            content_hash=content_hash,
            line_stream=self._text_to_lines(text),
            meta={"tenant_id": tenant_id, **(meta or {})},
        )

    # ------------------------------------------------------------------
    # 内部：流解析
    # ------------------------------------------------------------------

    async def _resolve_stream(
        self,
        row: Any,  # asyncpg.Record
        tenant_id: str,
    ) -> EvidenceStream | None:
        raw_ref = row["raw_payload_ref"]
        source_uri = row["source_uri"]

        # 优先级 1：raw_payload_ref 指向 file_server 文件
        if raw_ref and raw_ref.startswith("file://"):
            uri = raw_ref.replace("file://", "", 1)
            line_stream = self._fetch_file_lines(uri)
            return EvidenceStream(
                source_type="file_server",
                source_uri=uri,
                evidence_id=str(row["id"]),
                content_hash=hashlib.sha256(uri.encode()).hexdigest(),
                line_stream=line_stream,
                meta={
                    "evidence_type": row["evidence_type"],
                    "observed_at": row["observed_at"].isoformat() if row["observed_at"] else None,
                    "source_system": row["source_system"],
                    "tenant_id": tenant_id,
                },
            )

        # 优先级 2：source_uri 可直接获取
        if source_uri and (source_uri.startswith("http://") or source_uri.startswith("https://")):
            line_stream = self._fetch_http_lines(source_uri)
            return EvidenceStream(
                source_type="http",
                source_uri=source_uri,
                evidence_id=str(row["id"]),
                content_hash=hashlib.sha256(source_uri.encode()).hexdigest(),
                line_stream=line_stream,
                meta={
                    "evidence_type": row["evidence_type"],
                    "observed_at": row["observed_at"].isoformat() if row["observed_at"] else None,
                    "source_system": row["source_system"],
                    "tenant_id": tenant_id,
                },
            )

        # 优先级 3：summary_text 本身作为内联证据
        if row["summary_text"]:
            text = row["summary_text"]
            return await self.from_inline_text(
                text,
                evidence_id=str(row["id"]),
                tenant_id=tenant_id,
                meta={
                    "evidence_type": row["evidence_type"],
                    "observed_at": row["observed_at"].isoformat() if row["observed_at"] else None,
                    "source_system": row["source_system"],
                },
            )

        return None

    # ------------------------------------------------------------------
    # 内部：IO 流生成
    # ------------------------------------------------------------------

    async def _fetch_file_lines(self, uri: str) -> AsyncIterator[str]:
        """从 file_server 读取 gzip/文本文件的异步行流。"""
        if not self.file_server_base_url:
            raise RuntimeError("file_server_base_url not configured")

        url = f"{self.file_server_base_url.rstrip('/')}/{uri.lstrip('/')}"
        headers = {"Accept-Encoding": "gzip"}

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as resp:
                resp.raise_for_status()
                # 逐块读取并拆分行，避免内存膨胀
                buffer = ""
                async for chunk in resp.content.iter_chunked(self.chunk_size):
                    text = chunk.decode("utf-8", errors="ignore")
                    buffer += text
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        yield line
                if buffer:
                    yield buffer

    async def _fetch_http_lines(self, url: str) -> AsyncIterator[str]:
        """从任意 HTTP URL 读取文本流。"""
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                resp.raise_for_status()
                buffer = ""
                async for chunk in resp.content.iter_chunked(self.chunk_size):
                    text = chunk.decode("utf-8", errors="ignore")
                    buffer += text
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        yield line
                if buffer:
                    yield buffer

    async def _text_to_lines(self, text: str) -> AsyncIterator[str]:
        """将内联文本拆分为异步行流。"""
        for line in text.splitlines():
            yield line

    # ------------------------------------------------------------------
    # 工具：证据摘要生成（改编自 build_evidence_summary.py）
    # ------------------------------------------------------------------

    @staticmethod
    def build_summary(
        events: list[dict[str, Any]],
        max_events: int = 50,
    ) -> str:
        """
        从解析后的事件列表生成结构化摘要文本，供 diagnosis_records.reasoning_summary 使用。
        """
        if not events:
            return "No fault events detected in evidence."

        lines = [f"Evidence Summary ({len(events)} events):"]
        for i, ev in enumerate(events[:max_events], 1):
            ts = ev.get("timestamp") or "unknown_time"
            kind = ev.get("event_kind", "unknown")
            fault = ev.get("fault_type", "unknown")
            sev = ev.get("severity", "unknown")
            gpu = ev.get("gpu_index") or ev.get("pci_bdf") or "unknown_gpu"
            detail = ev.get("detail", "")[:120]
            lines.append(f"{i}. [{ts}] {kind.upper()} | {fault} | {sev} | GPU={gpu} | {detail}")

        if len(events) > max_events:
            lines.append(f"... and {len(events) - max_events} more events omitted.")

        return "\n".join(lines)

    @staticmethod
    def dedupe_key(
        tenant_id: str,
        source_system: str,
        source_uri: str | None,
        observed_at: datetime,
        content_hash: str,
    ) -> str:
        """生成 evidence 去重键。"""
        raw = f"{tenant_id}:{source_system}:{source_uri or ''}:{observed_at.isoformat()}:{content_hash}"
        return hashlib.sha256(raw.encode()).hexdigest()[:32]


# ---------------------------------------------------------------------------
# 快速扫描入口（改编自 minimal_complete_scan.py）
# ---------------------------------------------------------------------------

async def quick_scan_evidence(
    extractor: EvidenceExtractor,
    analyzer: Any,  # GpuFaultAnalyzer
    db_pool: Any,
    incident_id: int,
    tenant_id: str,
    diagnosis_context_id: str,
    actor_ref: str,
) -> dict[str, Any]:
    """
    最小完整扫描：读取 incident 关联的全部 evidence，运行分析，返回结果但不写入 DB。
    用于诊断前预览或快速健康检查。
    """
    all_events: list[dict[str, Any]] = []
    stream_count = 0

    async for stream in extractor.from_incident(db_pool, incident_id, tenant_id):
        stream_count += 1
        result = await analyzer.analyze_text_stream(
            stream.line_stream, tenant_id, diagnosis_context_id, actor_ref,
        )
        all_events.extend([e.__dict__ for e in result.events])

    # 简单计数聚合
    counters: dict[str, int] = {}
    for ev in all_events:
        ft = ev.get("fault_type", "unknown")
        counters[ft] = counters.get(ft, 0) + 1

    return {
        "stream_count": stream_count,
        "total_events": len(all_events),
        "counters": counters,
        "events": all_events[:100],  # 截断，避免过大响应
    }


# ---------------------------------------------------------------------------
# 计数扫描入口（改编自 final_counter_scan.py）
# ---------------------------------------------------------------------------

async def counter_scan_evidence(
    extractor: EvidenceExtractor,
    analyzer: Any,  # GpuFaultAnalyzer
    db_pool: Any,
    incident_id: int,
    tenant_id: str,
    diagnosis_context_id: str,
    actor_ref: str,
) -> dict[str, Any]:
    """
    最终计数扫描：仅返回聚合计数，不返回原始事件列表。
    用于报告生成和 dashboard 数据。
    """
    xid_counter: dict[str, int] = {}
    signal_counter: dict[str, int] = {}
    recovery_counter = 0
    stream_count = 0

    async for stream in extractor.from_incident(db_pool, incident_id, tenant_id):
        stream_count += 1
        result = await analyzer.analyze_text_stream(
            stream.line_stream, tenant_id, diagnosis_context_id, actor_ref,
        )
        for code, count in result.xid_by_code.items():
            xid_counter[code] = xid_counter.get(code, 0) + count
        for ev in result.events:
            if ev.event_kind == "signal" and ev.signal_type:
                signal_counter[ev.signal_type] = signal_counter.get(ev.signal_type, 0) + 1
            elif ev.event_kind == "recovery_action":
                recovery_counter += 1

    return {
        "stream_count": stream_count,
        "xid_by_code": xid_counter,
        "signal_by_type": signal_counter,
        "recovery_actions": recovery_counter,
    }
