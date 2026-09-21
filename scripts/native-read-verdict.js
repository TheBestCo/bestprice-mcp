/** Bounded diagnostic metadata only. Never retain request URLs or error text. */
export function recordNativeGuardFailure(report, observation, error) {
  report.blocked ??= {};
  report.blocked.navigation_guard_error = (report.blocked.navigation_guard_error ?? 0) + 1;
  report.guardErrors ??= [];
  if (report.guardErrors.length >= 8) return;
  let category = 'other_protocol_error';
  try {
    const message = String(error?.message ?? '');
    if (/Invalid InterceptionId|Invalid interceptionId|Invalid RequestId|Invalid requestId/u.test(message)) {
      category = 'request_no_longer_intercepted';
    } else if (/Target closed|Session closed|has been closed/u.test(message)) {
      category = 'target_or_session_closed';
    }
  } catch {
    // Diagnostic serialization must not create a second unhandled failure.
  }
  report.guardErrors.push({
    phase: /^[A-Za-z_:.-]{1,80}$/u.test(observation.phase ?? '') ? observation.phase : 'unknown',
    decision: observation.denied === true ? 'deny' : 'allow',
    document: observation.document === true,
    resourceType: /^[A-Za-z]{1,24}$/u.test(observation.resourceType ?? '')
      ? observation.resourceType
      : 'other',
    control: observation.control === true,
    category,
  });
}

/** Recheck after browser teardown: a late interception rejection must not leave a green receipt. */
export function finalizeNativeReadVerdict(report) {
  const category = report.blocked?.navigation_guard_error
    ? 'navigation_guard_failed'
    : report.blocked?.budget
      ? 'browser_budget_exhausted'
      : null;
  if (category) {
    report.passed = false;
    report.failure ??= { phase: 'browser_cleanup', category };
  }
  return report.passed === true ? 0 : 1;
}
