export const TOOL_DEFINITIONS = [
  {
    name: "parallel_review",
    description: `启动多个 Claude Code Agent 从不同维度并行评审指定的文件或代码。

评审维度包括:
- security: 安全评审（认证/授权/输入过滤/路径安全/加密）
- architecture: 架构评审（模块拆分/技术选型/接口设计/耦合度）
- performance: 性能评审（时间复杂度/内存使用/并发/IO）
- correctness: 正确性评审（逻辑错误/边界条件/错误处理）
- completeness: 完整性评审（需求覆盖/文档完整/测试覆盖）
- code_style: 代码风格评审（命名/结构/一致性）
- all: 全部维度

执行流程: 创建 Agent Manifest → Fan-Out 并行派发 → 等待全部返回 → Fan-In 汇总 → 输出综合报告

所需资源:
- 输入文件路径（必填）
- 评审维度列表（必填，可选单个或组合）
- 上下文材料路径（可选，如 PRD、设计文档等）
- 输出报告路径（必填）`,
    arguments: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "要评审的文件或目录的绝对路径"
        },
        dimensions: {
          type: "array",
          items: { 
            type: "string",
            enum: ["security", "architecture", "performance", "correctness", "completeness", "code_style", "all"]
          },
          description: "评审维度列表。'all' 表示全部 6 个维度"
        },
        context_files: {
          type: "array",
          items: { type: "string" },
          description: "评审时可参考的上下文文件路径（如 PRD、架构设计等）"
        },
        output_path: {
          type: "string",
          description: "综合评审报告的保存路径（绝对路径）"
        }
      },
      required: ["file_path", "dimensions", "output_path"]
    }
  },
  {
    name: "parallel_research",
    description: `启动多个 Claude Code Agent 从不同角度并行调研一个主题。

调研角度:
- competitive: 竞品分析
- technical: 技术方案调研
- papers: 学术论文/前沿研究
- ecosystem: 生态工具/社区
- risks: 风险/陷阱/已知问题

执行流程: 并行 WebSearch → 各 Agent 独立分析 → 汇总对比 → 输出研究报告`,
    arguments: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "调研主题"
        },
        angles: {
          type: "array",
          items: {
            type: "string",
            enum: ["competitive", "technical", "papers", "ecosystem", "risks", "all"]
          },
          description: "调研角度列表。'all' 表示全部"
        },
        output_path: {
          type: "string",
          description: "研究报告的保存路径"
        }
      },
      required: ["topic", "angles", "output_path"]
    }
  },
  {
    name: "orchestrate_review",
    description: `按照 cluster-orchestration 契约执行完整的多 Agent 评审流程:

1. 读取 .claude/contracts/cluster-orchestration.md 评估是否适合多 Agent
2. 创建 Work Packet Manifest
3. Fan-Out: 并行派发多个 Claude Code Agent
4. Fan-In: 收集、冲突裁决、聚合
5. 生成 synthesis-report.md + review provenance

这是最完整的评审流程，严格遵循规范架构。`,
    arguments: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "要评审的文件的绝对路径"
        },
        review_type: {
          type: "string",
          enum: ["code", "design", "prd", "architecture", "contract"],
          description: "评审类型"
        },
        output_dir: {
          type: "string",
          description: "评审结果输出目录"
        }
      },
      required: ["file_path", "review_type", "output_dir"]
    }
  },
  {
    name: "agent_status",
    description: "查看子 Agent 的运行状态",
    arguments: {
      type: "object",
      properties: {},
      required: []
    }
  }
];
