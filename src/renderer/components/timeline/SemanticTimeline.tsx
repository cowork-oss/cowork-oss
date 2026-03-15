/**
 * SemanticTimeline
 *
 * Renders a list of UiTimelineEvent[] as semantic cards.
 * Supports concise (default) and verbose modes.
 *
 * - Concise: short summaries, evidence collapsed
 * - Verbose: evidence expanded by default, raw events visible
 */

import { useMemo, useState } from "react";
import type { UiTimelineEvent } from "../../../shared/timeline-events";
import type { TaskEvent, TimelineVerbosity } from "../../../shared/types";
import { AgentEventCard } from "./AgentEventCard";
import { ApprovalEventCard } from "./ApprovalEventCard";
import { SummaryEventCard } from "./SummaryEventCard";

// ---------------------------------------------------------------------------
// Phase chip strip
// ---------------------------------------------------------------------------

const PHASE_ORDER = ["intake", "plan", "explore", "execute", "verify", "complete"] as const;

type TimelinePhase = (typeof PHASE_ORDER)[number];

function PhaseChips({ activePhases }: { activePhases: Set<TimelinePhase> }) {
  return (
    <div className="semantic-timeline-phases" role="navigation" aria-label="Timeline phases">
      {PHASE_ORDER.map((phase) => (
        <span
          key={phase}
          className={`phase-chip phase-chip-${phase} ${activePhases.has(phase) ? "active" : "inactive"}`}
        >
          {phase}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verbosity toggle
// ---------------------------------------------------------------------------

interface VerbosityToggleProps {
  verbosity: TimelineVerbosity;
  onChange: (v: TimelineVerbosity) => void;
}

function VerbosityToggle({ verbosity, onChange }: VerbosityToggleProps) {
  return (
    <div className="semantic-timeline-verbosity-toggle">
      <button
        type="button"
        className={`verbosity-btn ${verbosity === "summary" ? "active" : ""}`}
        onClick={() => onChange("summary")}
        aria-pressed={verbosity === "summary"}
      >
        Concise
      </button>
      <button
        type="button"
        className={`verbosity-btn ${verbosity === "verbose" ? "active" : ""}`}
        onClick={() => onChange("verbose")}
        aria-pressed={verbosity === "verbose"}
      >
        Verbose
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SemanticTimeline
// ---------------------------------------------------------------------------

interface SemanticTimelineProps {
  /** Semantic events produced by the timeline normalizer */
  events: UiTimelineEvent[];
  /** Raw task events (needed by RawEventDrawer for full payload display) */
  allEvents: TaskEvent[];
  /** Initial verbosity mode. Defaults to 'summary'. */
  initialVerbosity?: TimelineVerbosity;
  /** If true, hide the verbosity toggle (parent controls it externally) */
  hideVerbosityToggle?: boolean;
  /** If true, hide the phase chip strip */
  hidePhaseChips?: boolean;
}

export function SemanticTimeline({
  events,
  allEvents,
  initialVerbosity = "summary",
  hideVerbosityToggle = false,
  hidePhaseChips = false,
}: SemanticTimelineProps) {
  const [verbosity, setVerbosity] = useState<TimelineVerbosity>(initialVerbosity);

  const activePhases = useMemo(() => {
    const phases = new Set<TimelinePhase>();
    for (const event of events) {
      if (event.phase && PHASE_ORDER.includes(event.phase as TimelinePhase)) {
        phases.add(event.phase as TimelinePhase);
      }
    }
    return phases;
  }, [events]);

  const isVerbose = verbosity === "verbose";

  if (events.length === 0) {
    return <div className="semantic-timeline semantic-timeline-empty" />;
  }

  return (
    <div className="semantic-timeline" data-verbosity={verbosity}>
      {/* Header: phase chips + verbosity toggle */}
      {(!hidePhaseChips || !hideVerbosityToggle) && (
        <div className="semantic-timeline-header">
          {!hidePhaseChips && <PhaseChips activePhases={activePhases} />}
          {!hideVerbosityToggle && (
            <VerbosityToggle verbosity={verbosity} onChange={setVerbosity} />
          )}
        </div>
      )}

      {/* Card list */}
      <div className="semantic-timeline-feed" role="list">
        {events.map((event, index) => {
          const showConnectorAbove = index > 0;
          const showConnectorBelow = index < events.length - 1;

          switch (event.kind) {
            case "summary":
              return (
                <div key={event.id} role="listitem">
                  <SummaryEventCard
                    event={event}
                    allEvents={allEvents}
                    showConnectorAbove={showConnectorAbove}
                    showConnectorBelow={showConnectorBelow}
                    defaultExpanded={isVerbose}
                  />
                </div>
              );
            case "approval":
              return (
                <div key={event.id} role="listitem">
                  <ApprovalEventCard
                    event={event}
                    allEvents={allEvents}
                    showConnectorAbove={showConnectorAbove}
                    showConnectorBelow={showConnectorBelow}
                  />
                </div>
              );
            case "agent":
              return (
                <div key={event.id} role="listitem">
                  <AgentEventCard
                    event={event}
                    allEvents={allEvents}
                    showConnectorAbove={showConnectorAbove}
                    showConnectorBelow={showConnectorBelow}
                    defaultExpanded={isVerbose || event.status === "running"}
                  />
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
