"""
Multi-head attribute classifier for StyleLoom's "Upload a Photo" feature.

PREVIOUS BUG (found and fixed here): train_model() built the model, saved
its random initial weights immediately, and printed a success message —
there was no Dataset loop, no forward/backward pass, and epochs/manifest_path
/batch_size were accepted as arguments but never actually used. Running the
old script produced a randomly-initialized model, not a trained one, while
looking like it had worked.

This version:
  - actually reads config.yaml (was previously unused — backbone, image_size,
    batch_size, lr, epochs, weight_decay, num_workers, min_labeled_examples)
  - loads manifest.jsonl in the {"image_path", "labels": {attr: value|null}}
    format produced by prepare_dataset.py (also accepts the older flat format
    for backward compatibility)
  - skips any head with fewer than `min_labeled_examples` labeled rows,
    per config.yaml's own documented intent, so it stays randomly
    initialized rather than learning from too little data
  - uses ignore_index=-100 per attribute per example, so a missing label on
    one head for one image doesn't block training the other heads on that
    same image
  - runs a real training loop: forward, multi-head loss, backward, optimizer
    step, per-epoch loss/accuracy logging — then saves the actually-trained
    weights.
"""
import json
import argparse
import yaml
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).parents[1]
SCHEMA_PATH = ROOT / "data" / "label_schema.json"
SCHEMA = json.loads(SCHEMA_PATH.read_text())
IGNORE_INDEX = -100


def load_config(path=None):
    cfg_path = Path(path) if path else Path(__file__).parent / "config.yaml"
    with open(cfg_path) as f:
        return yaml.safe_load(f)


def load_manifest_rows(manifest_path):
    """Accepts both the nested {"labels": {...}} format from prepare_dataset.py
    and a flat {attr: value, ...} format (as in the bundled example manifest)."""
    rows = []
    with open(manifest_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if "labels" in row:
                rows.append({"image_path": row["image_path"], "labels": row["labels"]})
            else:
                labels = {k: v for k, v in row.items() if k != "image_path"}
                rows.append({"image_path": row["image_path"], "labels": labels})
    return rows


class AttributeDataset(Dataset):
    def __init__(self, rows, image_root, schema, encoders, image_size):
        self.rows = rows
        self.image_root = Path(image_root)
        self.schema = schema
        self.encoders = encoders
        self.transform = transforms.Compose([
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        row = self.rows[idx]
        img_path = self.image_root / row["image_path"]
        image = Image.open(img_path).convert("RGB")
        image = self.transform(image)

        labels = {}
        for attr in self.schema:
            raw = row["labels"].get(attr)
            if raw is None or raw not in self.encoders[attr]:
                labels[attr] = IGNORE_INDEX
            else:
                labels[attr] = self.encoders[attr][raw]
        return image, labels


RESNET_WEIGHTS_ENUM = {
    "resnet18": "ResNet18_Weights", "resnet34": "ResNet34_Weights",
    "resnet50": "ResNet50_Weights", "resnet101": "ResNet101_Weights", "resnet152": "ResNet152_Weights",
}


class StyleLoomMultiHeadResNet(nn.Module):
    def __init__(self, schema, backbone_name="resnet50"):
        super().__init__()
        backbone_fn = getattr(models, backbone_name)
        weights_enum_name = RESNET_WEIGHTS_ENUM.get(backbone_name)
        weights_enum = getattr(models, weights_enum_name, None) if weights_enum_name else None
        backbone = backbone_fn(weights=weights_enum.DEFAULT if weights_enum else None)
        num_ftrs = backbone.fc.in_features
        backbone.fc = nn.Identity()
        self.backbone = backbone

        self.heads = nn.ModuleDict({
            attr: nn.Sequential(
                nn.Dropout(0.2),
                nn.Linear(num_ftrs, 128),
                nn.ReLU(),
                nn.Linear(128, len(vocab)),
            )
            for attr, vocab in schema.items()
        })

    def forward(self, x):
        feats = self.backbone(x)
        return {attr: head(feats) for attr, head in self.heads.items()}


def count_labeled(rows, attr):
    return sum(1 for r in rows if r["labels"].get(attr) is not None)


def train_model(manifest_path, image_root, config_path=None, out_dir="train/runs/latest"):
    cfg = load_config(config_path)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training on device: {device} | backbone={cfg['backbone']} | epochs={cfg['epochs']}")

    rows = load_manifest_rows(manifest_path)
    if not rows:
        raise SystemExit(f"No rows found in {manifest_path}")

    encoders = {attr: {v: i for i, v in enumerate(vocab)} for attr, vocab in SCHEMA.items()}

    # Per config.yaml's documented intent: heads with too few labeled
    # examples stay randomly initialized rather than learning from noise.
    trainable_heads = []
    for attr in SCHEMA:
        n = count_labeled(rows, attr)
        if n >= cfg["min_labeled_examples"]:
            trainable_heads.append(attr)
        else:
            print(f"[!] Skipping head '{attr}': only {n} labeled examples (need {cfg['min_labeled_examples']}). "
                  f"It will stay randomly initialized — inference should report it as unavailable.")

    if not trainable_heads:
        raise SystemExit("No head has enough labeled examples to train. Label more data first (see label tooling in ml/docs).")

    model = StyleLoomMultiHeadResNet(SCHEMA, backbone_name=cfg["backbone"]).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg["lr"], weight_decay=cfg["weight_decay"])
    criterion = nn.CrossEntropyLoss(ignore_index=IGNORE_INDEX)

    dataset = AttributeDataset(rows, image_root, SCHEMA, encoders, cfg["image_size"])
    loader = DataLoader(dataset, batch_size=cfg["batch_size"], shuffle=True, num_workers=cfg["num_workers"])

    model.train()
    for epoch in range(cfg["epochs"]):
        total_loss = 0.0
        correct = {attr: 0 for attr in trainable_heads}
        seen = {attr: 0 for attr in trainable_heads}

        for images, labels in loader:
            images = images.to(device)
            optimizer.zero_grad()
            outputs = model(images)

            loss = 0.0
            for attr in trainable_heads:
                target = labels[attr].to(device)
                if (target != IGNORE_INDEX).sum() == 0:
                    continue
                loss = loss + criterion(outputs[attr], target)
                preds = outputs[attr].argmax(dim=1)
                mask = target != IGNORE_INDEX
                correct[attr] += (preds[mask] == target[mask]).sum().item()
                seen[attr] += mask.sum().item()

            if isinstance(loss, float):
                continue  # whole batch had no usable labels for any trainable head
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        acc_str = ", ".join(
            f"{attr}={correct[attr]/seen[attr]:.3f}" if seen[attr] else f"{attr}=n/a"
            for attr in trainable_heads
        )
        print(f"Epoch {epoch + 1}/{cfg['epochs']}  loss={total_loss / max(1, len(loader)):.4f}  {acc_str}")

    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    model_weight_file = out_path / "model_weights.pt"
    torch.save({
        "model_state": model.state_dict(),
        "schema": SCHEMA,
        "backbone": cfg["backbone"],
        "trainable_heads": trainable_heads,
    }, model_weight_file)
    print(f"[✓] Trained weights saved to {model_weight_file}")
    print(f"[i] Trained heads: {trainable_heads}")
    untrained = [a for a in SCHEMA if a not in trainable_heads]
    if untrained:
        print(f"[i] Untrained (randomly initialized) heads: {untrained} — label more data for these before relying on them.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="data/manifest.jsonl")
    parser.add_argument("--image_root", default=".", help="Directory that image_path entries in the manifest are relative to")
    parser.add_argument("--config", default=None)
    parser.add_argument("--out", default="train/runs/latest")
    args = parser.parse_args()

    train_model(args.manifest, args.image_root, args.config, args.out)
