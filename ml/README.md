# StyleLoom Vision — ML Attribute-Extraction Pipeline

This folder contains a **trainable, extensible pipeline** for fashion attribute
recognition. It is **not** wired to the live web app: shipping a live vision
inference service depends on trained model weights and hosting choices that are
outside a code-only build. See `docs/attributes.md` for a candid breakdown of
what is realistic to train from public datasets and which attributes need
additional labeled data.

## Attributes we target

| Attribute | Public-data coverage | Notes |
| --- | --- | --- |
| category (dress, top, bottom, ethnic, outerwear, footwear, bag) | ✅ DeepFashion, Fashion-MNIST | strong |
| color (dominant) | ✅ derivable via clustering + labels | strong |
| pattern (solid/floral/printed/striped/embellished) | ⚠️ partial in DeepFashion-Attribute | requires cleanup |
| fabric (cotton/silk/linen/…) | ⚠️ partial | best-effort |
| sleeve (sleeveless/short/half/three-quarter/long/puff) | ⚠️ partial | best-effort |
| neckline (round/v/square/off-shoulder/…) | ❌ minimal public data | **needs new labels** |
| fit (bodycon/a-line/wrap/flared/…) | ⚠️ partial | best-effort |
| length (mini/knee/midi/maxi/floor) | ⚠️ derivable | requires heuristics |
| occasion (casual/office/party/wedding/festive) | ❌ subjective | **needs labels** |

Attributes marked ❌ intentionally ship **untrained heads with a documented
fallback**: the pipeline builds the head and the inference call returns
`"unknown"` until you supply labels — no false accuracy claims.

## Folder layout

```
ml/
  requirements.txt
  data/
    prepare_dataset.py        # DeepFashion loader → unified attribute schema
    label_schema.json         # canonical target label vocabulary
  train/
    train_multitask.py        # multi-head ResNet-50 baseline (per-attribute heads)
    config.yaml               # hyperparameters
  inference/
    predict.py                # CLI: image → JSON attributes
    model_loader.py
  serve/
    api.py                    # FastAPI /predict stub (matches web app schema)
  docs/
    attributes.md             # honest per-attribute status
    training.md
```

## Getting started

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python data/prepare_dataset.py --source /path/to/DeepFashion --out data/prepared/
python train/train_multitask.py --config train/config.yaml
python inference/predict.py --image sample.jpg
```

## Integrating with StyleLoom web app

The `serve/api.py` FastAPI endpoint returns the same JSON shape the web app's
`parsePreferenceText` server function uses:

```json
{"attributes": {"color": ["pink"], "fabric": ["silk"], "sleeve": ["long"]}, "maxPrice": null}
```

Once you have model weights and hosting, expose the endpoint and wire it into
`parsePreferenceText` in `src/lib/recommendations.functions.ts` so uploaded
images go through the vision model. Until then, the web app relies on the
local text NLP path in `src/lib/nlp_parser.ts`, which works out of the box.

## Non-goals

- Guaranteeing accuracy on all 9 attributes without additional labeled data.
- Serving vision inference from the current Cloudflare Worker runtime (too
  heavy). Deploy the FastAPI service separately (Render / Fly / GPU host).
