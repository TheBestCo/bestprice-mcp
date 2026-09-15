import { gradeJourney, readTerminal } from './journey.js';
import { canonicalJson, sha256 } from './run-evidence.js';

// Structural success is not semantic correctness. Independent review is bound
// to exact observations AND the frozen task, never to an actor's self-score.
export const reviewDigest = (definition, execution) =>
  sha256(canonicalJson({ definition, steps: execution?.steps ?? [], terminal: readTerminal(execution) }));
export function qualifyTask(definition, execution, review) {
  const structural = gradeJourney(definition, execution);
  if (!['passed', 'refused'].includes(structural.outcome))
    return { qualified: false, reason: structural.reason };
  if (!review || review.digest !== reviewDigest(definition, execution))
    return { qualified: false, reason: 'missing or stale independent task review' };
  if (typeof review.reviewer !== 'string' || !review.reviewer.trim() || review.reviewer === execution.agent)
    return { qualified: false, reason: 'independent reviewer required' };
  if (
    review.taskSatisfied !== true ||
    review.grounded !== true ||
    typeof review.rationale !== 'string' ||
    !review.rationale.trim()
  )
    return { qualified: false, reason: 'task satisfaction and grounding not established' };
  if (structural.outcome === 'refused' && review.refusalReasonCorrect !== true)
    return { qualified: false, reason: 'intended refusal reason not verified' };
  return { qualified: true, reason: review.rationale };
}
