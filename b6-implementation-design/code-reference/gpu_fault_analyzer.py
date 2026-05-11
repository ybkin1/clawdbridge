"""
GPU Fault Analyzer — Harness 诊断模块

改编自 OpenClaw stream_openclaw_gpu_fault_analysis.py + aggregate_stream_fast.py
职责：流式解析 GPU 故障日志，提取 Xid、信号模式、时间、组件信息

位置：src/modules/ticket/diagnosis/gpu_fault_analyzer.py
Owner: PKG-06 (diagnosis-worker)
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, AsyncIterator, Iterator

import aiofiles


# ---------------------------------------------------------------------------
# 常量配置（可注入，便于后续扩展新 GPU 型号）
# ---------------------------------------------------------------------------

MONTHS = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}

DEFAULT_XID_SEVERITY: dict[str, str] = {
    "13": "Major",
    "31": "Critical",
    "43": "Major",
    "48": "Critical",
    "62": "Major",
    "74": "Major",
    "79": "Critical",
    "92": "Major",
    "94": "Major",
    "95": "Critical",
    "119": "Critical",
    "120": "Critical",
    "121": "Critical",
    "150": "Critical",
    "154": "Critical",
}

DEFAULT_SIGNAL_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    ("gsp_timeout", re.compile(r"GSP.*(?:RPC|RM_CONTROL).*timeout|Timeout after 45s of waiting for RPC response", re.I), "Critical"),
    ("gsp_lockdown", re.compile(r"GSP_LOCKDOWN_NOTICE|lockdown", re.I), "Major"),
    ("bad_register_read", re.compile(r"bad\s+register\s+read|badf57|badf56", re.I), "Major"),
    ("gpu_reset_required", re.compile(r"GPU\s+Reset\s+Required|Reset required \[NV_ERR_RESET_REQUIRED\]|requires reset", re.I), "Critical"),
    ("gpu_fullchip_reset", re.compile(r"FULLCHIP_RESET|NV_ERR_GPU_IN_FULLCHIP_RESET", re.I), "Critical"),
    ("gpu_fallen_off_bus", re.compile(r"fallen\s+off\s+(?:the\s+)?bus", re.I), "Critical"),
    ("nvlink_rxdetect", re.compile(r"NVLink.*RxDetect|RxDetect.*NVLink|PostRxDetect|post-Rx|knvlinkUpdatePostRxDetectLinkMask", re.I), "Major"),
    ("nvlink_error", re.compile(r"\bNVLink\b.*(?:error|fail|failed|fatal|timeout|unhealthy|unavailable)|(?:error|fail|failed|fatal|timeout|unhealthy|unavailable).*\bNVLink\b", re.I), "Major"),
    ("fabric_manager_error", re.compile(r"Fabric Manager.*(?:error|fail|failed|fatal|timeout|restart|restarted|stopped|inactive|not loaded|not present)|NV_ERR_FABRIC_MANAGER|fabricmanager.*(?:error|fail|failed|fatal|timeout|restart|stopped|inactive)", re.I), "Major"),
    ("driver_reload", re.compile(r"(?:nvidia|gpu).*driver.*(?:reload|reloaded|restart|restarted|unload|loaded)|NVRM: loading NVIDIA UNIX|NVRM: GPU at PCI", re.I), "Major"),
    ("rm_interrupt_threshold", re.compile(r"RM unhandled interrupt threshold|Going over RM unhandled interrupt", re.I), "Major"),
    ("ecc_error", re.compile(r"\bECC\b.*(?:error|uncorrect|double|retire|row remap)|(?:uncorrect|double).*ECC", re.I), "Critical"),
    ("pcie_aer_error", re.compile(r"\b(?:PCIe?|AER)\b.*(?:error|fatal|non-fatal|corrected|uncorrected|link down|link training)", re.I), "Major"),
    ("thermal_power_error", re.compile(r"(?:thermal|temperature|overtemp|power|voltage|PSU).*?(?:error|fail|fault|critical|shutdown)", re.I), "Major"),
    ("ib_mlx_error", re.compile(r"\b(?:mlx5|InfiniBand|ibstat|mlxlink|OpenSM)\b.*(?:error|fail|failed|down|degraded|inactive|fatal|timeout)", re.I), "Major"),
    ("bmc_sel_error", re.compile(r"\b(?:BMC|SEL|IPMI|sensor)\b.*(?:critical|error|fail|fault|assert|deassert)", re.I), "Major"),
    ("kernel_panic_oops", re.compile(r"\b(?:kernel panic|Oops|BUG:|Call Trace|segfault)\b", re.I), "Critical"),
    ("service_error", re.compile(r"\b(?:systemd|service)\b.*(?:failed|failure|inactive|dead|restart)", re.I), "Major"),
    ("nvswitch_error", re.compile(r"\b(?:NVSwitch|nvidia-nvswitch|NVLSM|nvlsm)\b.*(?:error|fail|failed|fatal|timeout|inactive|restart|stopped)", re.I), "Major"),
]

NEGATIVE_CONTEXT = re.compile(
    r"license|third-party-notices|copyright|source code form|this license|"
    r"\bif\b.*\berror\b|\bwithout error\b|example|description|documentation",
    re.I,
)

GPU_DETAIL_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # NVIDIA B200 格式
    (re.compile(
        r"NVIDIA B200,\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([0-9A-Fa-f:.]+),\s*([A-Za-z0-9._-]+)"
    ), "NVIDIA B200"),
    # 可扩展：H100, H200, A100 等
]


# ---------------------------------------------------------------------------
# 数据类
# ---------------------------------------------------------------------------

@dataclass
class ParsedEvent:
    line_number: int
    event_kind: str  # 'xid' | 'signal' | 'recovery_action' | 'identity'
    fault_type: str
    severity: str
    timestamp: str | None
    time_confidence: str
    time_authoritative: bool
    gpu_index: str | None
    pci_bdf: str | None
    serial: str | None
    process_id: str | None
    process_name: str | None
    detail: str
    source_section: str
    raw: str
    # Xid 专用
    xid_code: str | None = None
    # Recovery 专用
    recovery_action: str | None = None
    # Signal 专用
    signal_type: str | None = None


@dataclass
class GpuIdentity:
    gpu_index: str
    model: str
    pci_bdf: str
    serial: str | None
    driver: str | None = None
    memory: str | None = None
    vbios: str | None = None


@dataclass
class AnalysisResult:
    meta: dict[str, Any]
    gpu_identities: list[GpuIdentity]
    events: list[ParsedEvent]
    counters: dict[str, int]
    xid_by_code: dict[str, int]
    fault_by_bdf: dict[str, dict[str, int]]
    fault_by_gpu: dict[str, dict[str, int]]
    fault_by_sn: dict[str, dict[str, int]]
    fault_by_day: dict[str, dict[str, int]]
    clusters: list[dict[str, Any]]
    low_confidence_count: int


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def norm_bdf(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip()
    if re.match(r"^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}$", v):
        v += ".0"
    if re.match(r"^[0-9a-fA-F]{8}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7]$", v):
        v = v[-12:]
    return v.lower()


def extract_gpu_index(line: str) -> str | None:
    m = re.search(r"\bGPU\s*#?(\d+)\b", line, re.I)
    return m.group(1) if m else None


def extract_bdf(line: str) -> str | None:
    for pat in (
        r"PCI:([0-9a-fA-F:.]+)",
        r"(?:PCI\s+Bus\s+ID|PCIe?\s+BDF|Bus Id)\s*:\s*([0-9a-fA-F:.]+)",
    ):
        m = re.search(pat, line, re.I)
        if m:
            return norm_bdf(m.group(1))
    return None


def extract_process(line: str) -> tuple[str | None, str | None]:
    pid = re.search(r"\bpid\s*=\s*(\d+)\b", line, re.I)
    proc = re.search(r"\b(?:name|process|proc)\s*=\s*([A-Za-z0-9._:/+-]+)", line, re.I)
    return (pid.group(1) if pid else None, proc.group(1) if proc else None)


def parse_header_date(line: str) -> datetime | None:
    m = re.search(
        r"Date:\s*(?:\w{3}\s+)?(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\s+(AM|PM))?\s+\w+\s+(\d{4})",
        line,
        re.I,
    )
    if not m:
        return None
    mon, day, hh, mm, ss, ampm, year = m.groups()
    hour = int(hh)
    if ampm:
        marker = ampm.upper()
        if marker == "PM" and hour != 12:
            hour += 12
        elif marker == "AM" and hour == 12:
            hour = 0
    return datetime(int(year), MONTHS[mon], int(day), hour, int(mm), int(ss))


def extract_time(line: str, header_year: int | None, boot_time: datetime | None) -> dict[str, Any]:
    iso = re.search(r"(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})", line)
    if iso:
        raw = f"{iso.group(1)} {iso.group(2)}"
        return {
            "timestamp": raw,
            "event_time": raw,
            "event_time_raw": raw,
            "source_time_kind": "iso8601_or_sql",
            "time_confidence": "high",
            "time_authoritative": True,
        }
    syslog = re.search(r"\b(\w{3})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\b", line)
    if syslog:
        mon, day, hms = syslog.groups()
        raw = f"{mon} {day} {hms}"
        if header_year and mon in MONTHS:
            parsed = datetime.strptime(f"{header_year} {mon} {day} {hms}", "%Y %b %d %H:%M:%S")
            return {
                "timestamp": parsed.isoformat(sep=" "),
                "event_time": parsed.isoformat(sep=" "),
                "event_time_raw": raw,
                "source_time_kind": "syslog_header_year",
                "time_confidence": "medium",
                "time_authoritative": True,
            }
        return {
            "timestamp": None,
            "event_time": None,
            "event_time_raw": raw,
            "source_time_kind": "syslog_unanchored",
            "time_confidence": "low",
            "time_authoritative": False,
        }
    uptime = re.search(r"\[(\d+\.\d+)\]", line)
    if uptime:
        raw = uptime.group(1)
        if boot_time:
            parsed = boot_time + timedelta(seconds=float(raw))
            return {
                "timestamp": parsed.isoformat(sep=" "),
                "event_time": parsed.isoformat(sep=" "),
                "event_time_raw": raw,
                "source_time_kind": "dmesg_uptime_rebased",
                "time_confidence": "medium",
                "time_authoritative": True,
            }
        return {
            "timestamp": None,
            "event_time": None,
            "event_time_raw": raw,
            "source_time_kind": "dmesg_uptime",
            "time_confidence": "low",
            "time_authoritative": False,
        }
    return {
        "timestamp": None,
        "event_time": None,
        "event_time_raw": None,
        "source_time_kind": "missing",
        "time_confidence": "low",
        "time_authoritative": False,
    }


# ---------------------------------------------------------------------------
# 核心分析器
# ---------------------------------------------------------------------------

class GpuFaultAnalyzer:
    """
    OpenClaw 流式 GPU 故障分析引擎的 Harness 封装。

    用法：
        analyzer = GpuFaultAnalyzer(xid_severity=custom_map)
        result = await analyzer.analyze_stream(log_stream, tenant_id, context)
    """

    def __init__(
        self,
        xid_severity: dict[str, str] | None = None,
        signal_patterns: list[tuple[str, re.Pattern[str], str]] | None = None,
        gpu_detail_patterns: list[tuple[re.Pattern[str], str]] | None = None,
    ):
        self.xid_severity = xid_severity or DEFAULT_XID_SEVERITY.copy()
        self.signal_patterns = signal_patterns or DEFAULT_SIGNAL_PATTERNS.copy()
        self.gpu_detail_patterns = gpu_detail_patterns or GPU_DETAIL_PATTERNS.copy()

    # ------------------------------------------------------------------
    # 公开 API
    # ------------------------------------------------------------------

    async def analyze_file(
        self,
        file_path: Path,
        tenant_id: str,
        diagnosis_context_id: str,
        actor_ref: str,
        boot_time: datetime | None = None,
    ) -> AnalysisResult:
        """分析本地 gzip 日志文件（OpenClaw 兼容入口）。"""
        lines = self._read_gzip_lines(file_path)
        return await self._analyze_iter(lines, tenant_id, diagnosis_context_id, actor_ref, boot_time)

    async def analyze_text_stream(
        self,
        text_stream: AsyncIterator[str],
        tenant_id: str,
        diagnosis_context_id: str,
        actor_ref: str,
        boot_time: datetime | None = None,
    ) -> AnalysisResult:
        """分析异步文本流（Harness 标准入口，从 file_server 读取）。"""
        return await self._analyze_async(text_stream, tenant_id, diagnosis_context_id, actor_ref, boot_time)

    # ------------------------------------------------------------------
    # 内部实现
    # ------------------------------------------------------------------

    def _read_gzip_lines(self, path: Path) -> Iterator[str]:
        with gzip.open(path, "rt", encoding="utf-8", errors="ignore") as f:
            for raw in f:
                yield raw.rstrip("\n")

    async def _analyze_async(
        self,
        lines: AsyncIterator[str],
        tenant_id: str,
        diagnosis_context_id: str,
        actor_ref: str,
        boot_time: datetime | None = None,
    ) -> AnalysisResult:
        """消费异步行流并分析。"""
        # 将 async iterator 收集为 sync iterator（内存友好，逐行处理）
        sync_lines = []
        async for line in lines:
            sync_lines.append(line)
        return await self._analyze_iter(iter(sync_lines), tenant_id, diagnosis_context_id, actor_ref, boot_time)

    async def _analyze_iter(
        self,
        lines: Iterator[str],
        tenant_id: str,
        diagnosis_context_id: str,
        actor_ref: str,
        boot_time: datetime | None = None,
    ) -> AnalysisResult:
        line_count = 0
        header_time: datetime | None = None
        header_year: int | None = None
        hostname: str | None = None
        uname: str | None = None
        driver: str | None = None
        cuda: str | None = None
        fabric_manager: str | None = None

        gpu_identities: list[GpuIdentity] = []
        gpu_map_by_bdf: dict[str, dict[str, Any]] = {}
        gpu_map_by_index: dict[str, dict[str, Any]] = {}
        last_gpu_index: str | None = None
        last_bdf: str | None = None

        events: list[ParsedEvent] = []
        counters = Counter()
        xid_by_code = Counter()
        fault_by_bdf: dict[str, Counter] = defaultdict(Counter)
        fault_by_gpu: dict[str, Counter] = defaultdict(Counter)
        fault_by_sn: dict[str, Counter] = defaultdict(Counter)
        fault_by_day: dict[str, Counter] = defaultdict(Counter)

        for line in lines:
            line_count += 1

            # Header parsing
            htime = parse_header_date(line)
            if htime and not header_time:
                header_time = htime
                header_year = htime.year

            if line.startswith("uname:"):
                uname = line.split("uname:", 1)[1].strip()
                host_match = re.search(r"Linux\s+(\S+)", line)
                if host_match:
                    hostname = host_match.group(1)

            if "DRIVER version" in line:
                driver = line.split(":", 1)[-1].strip()
            if "CUDA Version" in line:
                cuda = line.split(":", 1)[-1].strip()
            if "Fabric Manager version is" in line:
                fabric_manager = line.strip()

            # GPU identity extraction
            for pat, model in self.gpu_detail_patterns:
                gdetail = pat.search(line)
                if gdetail:
                    idx = str(len(gpu_identities))
                    item = {
                        "gpu_index": idx,
                        "model": model,
                        "driver": gdetail.group(1).strip(),
                        "memory": gdetail.group(2).strip(),
                        "vbios": gdetail.group(3).strip(),
                        "pci_bdf": norm_bdf(gdetail.group(4)),
                        "serial": gdetail.group(5).strip(),
                    }
                    gpu_identities.append(GpuIdentity(**item))
                    gpu_map_by_bdf[item["pci_bdf"]] = item
                    gpu_map_by_index[idx] = item

            # nvidia-smi style identity blocks
            gpu_header = re.search(r"^\s*GPU\s+([0-9A-Fa-f:.]+)\s*$", line)
            if gpu_header:
                last_bdf = norm_bdf(gpu_header.group(1))
                if last_bdf and last_bdf in gpu_map_by_bdf:
                    last_gpu_index = gpu_map_by_bdf[last_bdf]["gpu_index"]

            sn_match = re.search(
                r"(?:GPU\s+(\d+)\s*:?\s*)?(?:GPU\s+)?Board Serial Number\s*:\s*([A-Za-z0-9._-]+)",
                line,
                re.I,
            )
            if sn_match:
                idx = sn_match.group(1) or last_gpu_index or extract_gpu_index(line)
                bdf = extract_bdf(line) or last_bdf
                if bdf:
                    gpu_map_by_bdf.setdefault(bdf, {}).update({"gpu_index": idx, "pci_bdf": bdf, "serial": sn_match.group(2)})
                if idx:
                    gpu_map_by_index.setdefault(idx, {}).update({"gpu_index": idx, "pci_bdf": bdf, "serial": sn_match.group(2)})

            # Resolve current GPU context
            bdf = extract_bdf(line)
            gpu_index = extract_gpu_index(line)
            if not gpu_index and bdf and bdf in gpu_map_by_bdf:
                gpu_index = gpu_map_by_bdf[bdf].get("gpu_index")
            serial = None
            if bdf and bdf in gpu_map_by_bdf:
                serial = gpu_map_by_bdf[bdf].get("serial")
            if not serial and gpu_index and gpu_index in gpu_map_by_index:
                serial = gpu_map_by_index[gpu_index].get("serial")

            tctx = extract_time(line, header_year, boot_time)

            # Xid detection
            xid_event = self._parse_xid(line, line_count, bdf, gpu_index, serial, tctx)
            if xid_event:
                events.append(xid_event)
                counters["xid_total"] += 1
                xid_by_code[xid_event.xid_code or "unknown"] += 1
                if bdf:
                    fault_by_bdf[bdf][f"XID_{xid_event.xid_code}"] += 1
                if gpu_index:
                    fault_by_gpu[gpu_index][f"XID_{xid_event.xid_code}"] += 1
                if serial:
                    fault_by_sn[serial][f"XID_{xid_event.xid_code}"] += 1
                if tctx["timestamp"]:
                    fault_by_day[tctx["timestamp"][:10]][f"XID_{xid_event.xid_code}"] += 1
                continue

            # Recovery action detection
            recovery_event = self._parse_recovery_action(line, line_count, bdf, gpu_index, serial, tctx, gpu_map_by_index)
            if recovery_event:
                events.append(recovery_event)
                counters["gpu_recovery_action"] += 1
                if gpu_index:
                    fault_by_gpu[gpu_index]["GPU_RECOVERY_ACTION"] += 1
                if bdf:
                    fault_by_bdf[bdf]["GPU_RECOVERY_ACTION"] += 1
                if serial:
                    fault_by_sn[serial]["GPU_RECOVERY_ACTION"] += 1
                continue

            # Signal pattern detection
            signal_event = self._parse_signal(line, line_count, bdf, gpu_index, serial, tctx)
            if signal_event:
                events.append(signal_event)
                counters[signal_event.signal_type or "unknown"] += 1
                if bdf:
                    fault_by_bdf[bdf][signal_event.signal_type or "unknown"] += 1
                if gpu_index:
                    fault_by_gpu[gpu_index][signal_event.signal_type or "unknown"] += 1
                if serial:
                    fault_by_sn[serial][signal_event.signal_type or "unknown"] += 1
                if tctx["timestamp"]:
                    fault_by_day[tctx["timestamp"][:10]][signal_event.signal_type or "unknown"] += 1
                continue

            # Generic error-like line counting (non-blocking)
            if any(token in line.lower() for token in ("error", "fail", "fatal", "critical", "timeout", "reset required", "not loaded", "not present")):
                if not NEGATIVE_CONTEXT.search(line):
                    counters["generic_error_like_lines"] += 1

        # Clustering
        clusters = self._cluster_events(events)

        # Low confidence count
        low_confidence_count = sum(1 for e in events if not e.time_authoritative)

        return AnalysisResult(
            meta={
                "tenant_id": tenant_id,
                "diagnosis_context_id": diagnosis_context_id,
                "actor_ref": actor_ref,
                "host": hostname,
                "uname": uname,
                "bug_report_time": header_time.isoformat(sep=" ") if header_time else None,
                "driver": driver,
                "cuda": cuda,
                "fabric_manager": fabric_manager,
                "line_count": line_count,
            },
            gpu_identities=gpu_identities,
            events=events,
            counters=dict(counters),
            xid_by_code=dict(xid_by_code),
            fault_by_bdf={k: dict(v) for k, v in fault_by_bdf.items()},
            fault_by_gpu={k: dict(v) for k, v in fault_by_gpu.items()},
            fault_by_sn={k: dict(v) for k, v in fault_by_sn.items()},
            fault_by_day={k: dict(v) for k, v in fault_by_day.items()},
            clusters=clusters,
            low_confidence_count=low_confidence_count,
        )

    # ------------------------------------------------------------------
    # 解析子方法
    # ------------------------------------------------------------------

    def _parse_xid(
        self,
        line: str,
        line_number: int,
        bdf: str | None,
        gpu_index: str | None,
        serial: str | None,
        tctx: dict[str, Any],
    ) -> ParsedEvent | None:
        xid = re.search(r"Xid\s+\(PCI:([^)]+)\)\s*:\s*(\d+)(?:,\s*(.*))?", line, re.I)
        if not xid:
            bare = re.search(r"\bXid\s+(\d+)\b(?:,\s*(.*))?", line, re.I)
            if bare:
                xid = bare
        if not xid:
            return None

        if xid.lastindex and xid.lastindex >= 3:
            bdf = norm_bdf(xid.group(1))
            code = xid.group(2)
            detail = xid.group(3) or ""
        else:
            code = xid.group(1)
            detail = xid.group(2) or ""

        pid, proc = extract_process(line)
        return ParsedEvent(
            line_number=line_number,
            event_kind="xid",
            fault_type=f"GPU_XID_{code}",
            severity=self.xid_severity.get(code, "Major"),
            timestamp=tctx.get("timestamp"),
            time_confidence=tctx.get("time_confidence", "low"),
            time_authoritative=tctx.get("time_authoritative", False),
            gpu_index=gpu_index,
            pci_bdf=bdf,
            serial=serial,
            process_id=pid,
            process_name=proc,
            detail=detail[:500],
            source_section="nvidia_bug_report",
            raw=line[:1000],
            xid_code=code,
        )

    def _parse_recovery_action(
        self,
        line: str,
        line_number: int,
        bdf: str | None,
        gpu_index: str | None,
        serial: str | None,
        tctx: dict[str, Any],
        gpu_map_by_index: dict[str, Any],
    ) -> ParsedEvent | None:
        recovery = re.search(r"GPU(?:\s+(\d+))?\s+Recovery Action\s*:\s*(.+)$", line, re.I)
        if not recovery:
            return None
        idx = recovery.group(1) or gpu_index
        action = recovery.group(2).strip()
        bdf2 = bdf or (gpu_map_by_index.get(idx or "", {}).get("pci_bdf") if idx else None)
        serial2 = (gpu_map_by_index.get(idx or "", {}).get("serial") if idx else None) or serial
        return ParsedEvent(
            line_number=line_number,
            event_kind="recovery_action",
            fault_type="GPU_RECOVERY_ACTION",
            severity="Critical" if re.search(r"reset|required|reboot", action, re.I) else "Major",
            timestamp=tctx.get("timestamp"),
            time_confidence=tctx.get("time_confidence", "low"),
            time_authoritative=tctx.get("time_authoritative", False),
            gpu_index=idx,
            pci_bdf=bdf2,
            serial=serial2,
            process_id=None,
            process_name=None,
            detail=action,
            source_section="nvidia_bug_report",
            raw=line[:1000],
            recovery_action=action,
        )

    def _parse_signal(
        self,
        line: str,
        line_number: int,
        bdf: str | None,
        gpu_index: str | None,
        serial: str | None,
        tctx: dict[str, Any],
    ) -> ParsedEvent | None:
        for signal_name, pattern, severity in self.signal_patterns:
            if pattern.search(line):
                return ParsedEvent(
                    line_number=line_number,
                    event_kind="signal",
                    fault_type=signal_name.upper(),
                    severity=severity,
                    timestamp=tctx.get("timestamp"),
                    time_confidence=tctx.get("time_confidence", "low"),
                    time_authoritative=tctx.get("time_authoritative", False),
                    gpu_index=gpu_index,
                    pci_bdf=bdf,
                    serial=serial,
                    process_id=None,
                    process_name=None,
                    detail=line[:500],
                    source_section="nvidia_bug_report",
                    raw=line[:1000],
                    signal_type=signal_name,
                )
        return None

    def _cluster_events(self, events: list[ParsedEvent]) -> list[dict[str, Any]]:
        from collections import defaultdict
        clusters = defaultdict(lambda: {"count": 0, "signals": Counter(), "xids": Counter(), "first": None, "last": None})
        for e in events:
            if not e.time_authoritative or not e.timestamp:
                continue
            ts = datetime.strptime(e.timestamp.replace(" ", "T"), "%Y-%m-%dT%H:%M:%S")
            bucket_minute = (ts.minute // 10) * 10
            bucket = ts.replace(minute=bucket_minute, second=0).isoformat(sep=" ")
            comp = e.serial or e.pci_bdf or e.gpu_index or "unknown"
            key = f"{bucket}|{comp}"
            c = clusters[key]
            c["count"] += 1
            if e.xid_code:
                c["xids"][e.xid_code] += 1
            if e.signal_type:
                c["signals"][e.signal_type] += 1
            c["first"] = c["first"] or e.timestamp
            c["last"] = e.timestamp

        rows = []
        for key, c in clusters.items():
            bucket, comp = key.split("|", 1)
            rows.append({
                "bucket": bucket,
                "component": comp,
                "count": c["count"],
                "xids": dict(c["xids"]),
                "signals": dict(c["signals"]),
                "first": c["first"],
                "last": c["last"],
            })
        rows.sort(key=lambda r: (-r["count"], r["bucket"]))
        return rows
