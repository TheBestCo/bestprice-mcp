# Saved comparisons: implementation facts for the privacy notice

This records the implemented behavior for the normal policy-owner workflow.
It is not an assertion that the corporate policy has been updated or that
all legal obligations have been assessed. The private comparison feature
remains held until its disclosure and actual-host qualification are complete.

## Exact data and purpose

With a separate `comparisons:manage` grant, the shopper can deliberately save
one to four selected product variants together with their requirements,
optional budget and delivery postcode, unresolved questions, checked item and
shipping prices, timestamps and comparison status. The immutable original
snapshot supports a later manual “what changed?” check. Rechecking does not
confirm an unknown size, feature or shipping cost.

Saved contents use the BestPrice account key and authenticated encryption.
SQL also holds the owner reference, opaque record ID, version and timestamps.
The MCP process holds no database or account-decryption key. It delegates
requests to the protected account service, which verifies the current grant
and ownership on every operation. The website uses the normal logged-in
BestPrice session and a signed, record-bound CSRF ticket for changes.

The linked OpenAI host receives the saved content returned for an explicitly
opened comparison. Listing is limited to titles, states and timestamps.
This permission grants no purchase, payment, order-history or browsing-history
access. Events-only grants do not gain comparison access through refresh.

## Expiry and deletion

The grant lasts at most 30 days. Saved comparisons expire after 180 days;
expired records cannot be opened through the service. Indexed physical cleanup
removes up to 100 expired records per ten-minute tick and yields under pool
pressure. It continues if the shopping feature is disabled. These are cleanup
eligibility rules, not an exact deletion deadline or a backup-retention claim.

The shopper can delete an exact saved comparison. The removed-account cleanup
registry includes the comparison table by its indexed owner ID. Revoking an
OpenAI grant ends that grant’s access; it does not itself delete the account’s
saved comparisons, which remain manageable on BestPrice. Disconnect-to-revoke
behavior in every host has not been established.

## Suggested Greek factual wording for the policy owner

Με ξεχωριστή άδειά σου, η σύνδεση με το ChatGPT μπορεί να αποθηκεύει συγκρίσεις
που επιλέγεις στον λογαριασμό σου στο BestPrice. Η σύγκριση περιλαμβάνει τις
απαιτήσεις σου, τα επιλεγμένα προϊόντα, προαιρετικό όριο τιμής και ταχυδρομικό
κώδικα, εκκρεμείς ερωτήσεις και τις τιμές που ελέγχθηκαν μαζί με τον χρόνο
ελέγχου. Όταν ανοίγεις μια αποθηκευμένη σύγκριση, τα αντίστοιχα στοιχεία
επιστρέφονται στο ChatGPT. Δεν παρέχεται πρόσβαση σε αγορές ή ιστορικό
περιήγησης και δεν εκτελούνται αγορές ή πληρωμές.

Οι αποθηκευμένες συγκρίσεις κρυπτογραφούνται και λήγουν μετά από 180 ημέρες.
Η αφαίρεση των ληγμένων εγγραφών γίνεται με περιοδική διαδικασία. Μπορείς να
διαγράψεις μια σύγκριση. Η άδεια σύνδεσης ισχύει έως 30 ημέρες· η ανάκλησή της
σταματά την πρόσβαση της συγκεκριμένης σύνδεσης, χωρίς να διαγράφει αυτόματα
τις συγκρίσεις του λογαριασμού σου.

## Evidence and remaining review

The isolated real-MySQL qualifier passed encryption, account isolation,
durable reopening, conflicting updates, idempotent saves, immutable baseline,
unknown totals, tamper refusal and expiry cleanup on November 3. Fixture tables
were removed afterward. No real user or subscription was manufactured.

The policy owner still needs to align the database-managed corporate notice,
including its recipients and retention wording. Backup and operational-log
retention are not established by the comparison-service tests. A dedicated
reviewer account and the real linked save/open/recheck/delete journey remain
separate gates. Never enter reviewer credentials into a public ZIP or repository.

Source: `bp-backend-node/apis/agent-commerce/comparisons/_lib/{service,store,retention.job}.js`,
`apis/agent-commerce/oauth/_lib/{protocol,service}.js`,
`apis/users/internal/ClearRemoved/tables.js`, and
`BestPrice.gr/extra/agentComparisons/AgentComparisonsPage.php`.
