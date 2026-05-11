class Metrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, () => number>();

  inc(name: string, labels?: Record<string, string>): void {
    const key = labels ? `${name}{${Object.entries(labels).map(([k,v])=>`${k}="${v}"`).join(',')}}` : name;
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }

  setGauge(name: string, fn: () => number): void { this.gauges.set(name, fn); }

  getPrometheusText(): string {
    const lines: string[] = [];
    for (const [k, v] of this.counters) lines.push(`${k} ${v}`);
    for (const [k, fn] of this.gauges) lines.push(`${k} ${fn()}`);
    return lines.join('\n') + '\n';
  }
}

export const metrics = new Metrics();
// 6 metrics from Design §9.2
metrics.setGauge('clawd_ws_connections', () => 0);
metrics.setGauge('clawd_claude_processes{running}', () => 0);
