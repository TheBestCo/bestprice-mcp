/**
 * What later contracts took out of the results an earlier dataset requires, so a frozen dataset's
 * required result properties can still be checked against the published contract: every one it
 * requires is either still in a success of that tool, or named here as removed since.
 */

/* Contract 2.0 removed these tools. */
export const TOOLS_REMOVED_SINCE = Object.freeze([
  'get_listing_sort_options',
  'get_product_details',
  'open_visible_product',
  'show_price_history',
]);

/* Contract 2.1 took these properties out of a tool's success. */
export const PROPERTIES_REMOVED_SINCE = Object.freeze({
  search_bestprice: Object.freeze(['navigated', 'outcome', 'next_tools']),
  open_product: Object.freeze(['category', 'current_min_price_eur', 'offer_count', 'rating', 'rating_count']),
  apply_listing_filter: Object.freeze(['action', 'applied', 'dispatched']),
  clear_listing_filters: Object.freeze(['action', 'applied', 'dispatched', 'changed']),
  apply_listing_sort: Object.freeze(['action', 'applied', 'dispatched']),
});

/**
 * Where a dataset requires a result property the published contract no longer has, and that is not
 * accounted for as removed since: `[]` when every requirement is either current or history.
 */
export function unaccountedRequirements(dataset, definitions) {
  const found = [];
  for (const item of dataset.cases) {
    for (const [tool, properties] of Object.entries(item.required_result_properties ?? {})) {
      if (!definitions[tool]) {
        if (!TOOLS_REMOVED_SINCE.includes(tool)) found.push(`${item.id}: ${tool}`);
        continue;
      }
      const success = definitions[tool].outputSchema.oneOf.find(
        branch => branch.properties.ok.const === true,
      );
      for (const property of properties) {
        if (Object.hasOwn(success.properties, property)) continue;
        if (!PROPERTIES_REMOVED_SINCE[tool]?.includes(property))
          found.push(`${item.id}: ${tool}.${property}`);
      }
    }
  }
  return found;
}
