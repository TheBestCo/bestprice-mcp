# Separate BestPrice ACP onboarding

The CSS-backed export is a separate discovery-only integration. BestPrice is the
comparison platform; independent shops sell the products and own checkout. No
checkout or payment capability is added to the plugin ZIP.

## Prepared artifacts

The October 1 qualified source sample contains **10,000 unique items and supplying
offers**, twenty product families, 406 sellers and 247 brands. Its gzip SHA-256 is
`8cde6359d4436ceb4d00a538c64e96569f64d7f09c9f497aba80ed86db3c2b76`.

A separate balanced onboarding sample was prepared at **04:40:02 UTC** from that
source, observed at 03:30:24 UTC. It contains **100 unique items and offers**, five
per family, 45 sellers and 47 brands. Its export-profile validator reports zero
schema, URL, currency, duplicate-ID, missing-image or GTIN errors. Its hashes are:

- `products.jsonl.gz`: `52725424e2eff6f0bee5b4fe9f077a2bcd01af85198d524565097239f1e267a8`
- Uncompressed JSONL: `41ca0c80e93871576c0d1873f515e973d35c499cc756fcee8c04769434483aa9`

The artifacts remain local, outside the plugin ZIP and public repository.
Regenerate from fresh source before actual delivery. Local schema validation
does not establish approval of Greece/EUR, comparison-platform mapping, real
crawler access or partner processing.

## Application prepared, not submitted

The [official merchant application](https://chatgpt.com/merchants/) is drafted for
BestPrice, Greece, https://www.bestprice.gr/, electronics/appliances and product-feed
integration. The selected 0–1M size range describes the intended 10,000-item pilot;
the notes explicitly distinguish it from a full production catalog. The
“feed ready and meets OpenAI specifications” declaration is left unchecked.
Required business contact fields are pending; private account details are not
reused for this application.

Prepared company notes:

> BestPrice is a Greece-based comparison shopping platform, not the selling
> merchant. We seek discovery-only integration for Greece/EUR with checkout on
> independent merchant sites. We have prepared a separately validated, Google
> CSS-backed pilot of 10,000 unique grouped products and supplying offers across
> 20 product families, plus a balanced 100-item onboarding sample. Public
> BestPrice product pages preserve supplying merchant attribution; no checkout
> or payments are offered by this integration. Please confirm Greece/EUR
> eligibility, comparison-platform onboarding, multi-seller/canonical-item
> mapping and durable attribution before provisioning feed delivery. The pilot
> is a sample, not a complete production catalog; partner ingestion,
> refresh/removal and crawler acceptance are pending.

## Partner acceptance gates

OpenAI's [getting-started guide](https://developers.openai.com/commerce/guides/get-started)
requires approved partner access. The standard
[file-upload product specification](https://developers.openai.com/commerce/specs/file-upload/products)
defaults to the US market; EUR values and Greek URLs do not establish a Greek
market integration. Obtain explicit Greece/EUR eligibility and comparison-platform
mapping approval before delivery.

After approval, use only the partner-provisioned transport. The
[file-upload guide](https://developers.openai.com/commerce/specs/file-upload/overview)
describes gzip JSONL through SFTP, a small initial sample and daily complete
snapshots. Confirm ingestion, refresh and explicit removals; omitted records can
remain for up to fourteen days. This bounded pilot must not be called a complete
production snapshot. Do not send the flat file-upload rows to the differently
shaped Products API. Do not upload internal custody files, credentials or the
plugin ZIP.

Acceptance requires partner processing evidence, actual crawler access and
durable merchant/canonical-item attribution. No application receipt, transport
credentials, upload, ingestion approval or product visibility has been observed.
