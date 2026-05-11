// tools.js — MCP Tool Definitions for constraint-enforcer

export const toolDefinitions = [
  {
    name: "check_phase_readiness",
    description:
      "Check whether the active task is ready for phase transition. " +
      "Returns a structured readiness report listing mechanical gaps " +
      "(missing checkers, evidence locks, blockers, failed gates).",
    inputSchema: {
      type: "object",
      properties: {
        taskDir: {
          type: "string",
          description:
            "Absolute path to the task directory. If omitted, auto-detects the most recently modified active task.",
        },
      },
      required: [],
    },
  },
  {
    name: "run_mandatory_checkers",
    description:
      "Run any missing mandatory checkers for the active task and generate standard checker_result.yaml files. " +
      "Returns a summary of which checkers were run, skipped, or placed into manual_pending.",
    inputSchema: {
      type: "object",
      properties: {
        taskDir: {
          type: "string",
          description:
            "Absolute path to the task directory. If omitted, auto-detects the most recently modified active task.",
        },
        checkerFilter: {
          type: "string",
          description:
            "Comma-separated list of specific checker IDs to run. If omitted, runs all missing mandatory checkers.",
        },
      },
      required: [],
    },
  },
  {
    name: "validate_write_permission",
    description:
      "Validate whether a Write/Edit operation to a given file path is allowed under the current task phase. " +
      "Returns {allowed: boolean, reason: string}. Blocks sensitive files (evidence locks, checker results, receipts) " +
      "when mechanical gaps exist.",
    inputSchema: {
      type: "object",
      properties: {
        taskDir: {
          type: "string",
          description: "Absolute path to the task directory. Auto-detected if omitted.",
        },
        filePath: {
          type: "string",
          description: "Target file path for the Write/Edit operation.",
        },
        operation: {
          type: "string",
          enum: ["Write", "Edit"],
          description: "Tool name: Write or Edit.",
        },
      },
      required: ["filePath", "operation"],
    },
  },
  {
    name: "generate_evidence_lock",
    description:
      "Collect completed checker results and gate status, then generate evidence-lock-<phase>.yaml. " +
      "This locks the evidence for the current phase and enables phase transition.",
    inputSchema: {
      type: "object",
      properties: {
        taskDir: {
          type: "string",
          description: "Absolute path to the task directory. Auto-detected if omitted.",
        },
      },
      required: [],
    },
  },
  {
    name: "request_phase_transition",
    description:
      "Validate all mechanical conditions for phase transition. If passed, update phase_status and generate evidence lock. " +
      "This is the full gate-check before moving a task from one phase to the next.",
    inputSchema: {
      type: "object",
      properties: {
        taskDir: {
          type: "string",
          description: "Absolute path to the task directory. Auto-detected if omitted.",
        },
        nextPhase: {
          type: "string",
          description: "Target phase to transition into. If omitted, assumes next sequential phase.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_checker_catalog",
    description:
      "Return the full catalog of available checkers from checkers/index.yaml, including metadata, output schema, and implementation status.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];
