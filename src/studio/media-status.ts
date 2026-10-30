const explanations: Record<string, string> = {
  media_request_contract_changed: "These generation options no longer match the reviewed provider request. No new payment was submitted. Contact support before creating a replacement request.",
  perflo_price_exceeds_ceiling: "The provider's current price exceeds this request's reserved allowance. No new payment was submitted. Review the price before starting a new request.",
  perflo_service_unavailable: "This generation service is unavailable in the current provider catalog. No new payment was submitted. Existing receipts remain recoverable.",
  media_disk_space_required: "The workstation needs more free space before processing can continue. Contact support, then reconnect this same job; do not start a second purchase.",
  payment_outcome_unknown: "The payment acknowledgement was lost and no task ID is available. Allowance remains reserved. Support must check the provider's records before resolving it.",
  payment_settlement_pending: "The provider has not reported a final charge. Check the existing receipt to reconnect; this does not make another purchase.",
  payment_workstation_missing: "The original payment workstation is unavailable. Support needs its saved receipt or the provider's final payment record.",
  media_tools_missing: "The workstation is missing a media processing tool. Contact support and reconnect the same job after repair.",
  media_authorization_revoked: "Publication was cancelled because the project or employee is no longer authorized. Any submitted payment is still reconciled separately.",
  media_processing_failed: "Media processing stopped. Keep this job for recovery and contact support with its reference.",
  media_too_large: "The source exceeds the pilot's 256 MiB media limit. Choose a smaller source. Any submitted charge remains recorded on this job.",
  media_proxy_too_large: "The editing copy exceeds the supported size. Support can inspect the existing source without buying it again.",
  media_duration_exceeds_pilot_limit: "The source exceeds the pilot's ten-minute media limit. Choose a shorter source.",
  director_budget_required: "Robyn needs more AI allowance. Adjust the Studio budget or cancel this unpaid job.",
};
export function mediaStatusMessage(code: string) {
  return explanations[code] ?? "This job needs attention. Reconnect the same job or contact support with its reference.";
}
