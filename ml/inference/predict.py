import os
import json
import argparse
from pathlib import Path

SCHEMA_PATH = Path(__file__).parents[1] / "data" / "label_schema.json"
if SCHEMA_PATH.exists():
    SCHEMA = json.loads(SCHEMA_PATH.read_text())
else:
    # Kept in sync with backend/frontend ATTRIBUTE_GROUPS (src/lib/products.ts) —
    # a previous version of this fallback used invented values like "emerald",
    # "ruby", "chiffon silk" that don't exist anywhere in the real catalog's
    # vocabulary, so even a working model would never produce a matchable
    # prediction. This fallback only runs if label_schema.json is missing.
    SCHEMA = {
        "category": ["dress", "women", "men", "kids", "ethnic", "genz"],
        "color": ["white", "red", "green", "yellow", "black", "blue", "pink", "coral", "beige", "brown", "purple", "orange", "gold"],
        "pattern": ["solid", "floral", "printed", "embellished", "striped"],
        "sleeve": ["short", "sleeveless", "half", "puff", "full", "long", "three-quarter"],
        "neckline": ["off-shoulder", "round", "cowl", "v-neck", "square", "collar", "sweetheart", "open"],
        "fabric": ["lace", "chiffon", "satin", "cotton", "knit", "linen", "georgette", "velvet", "silk", "denim", "tulle"],
        "fit": ["a-line", "flared", "bodycon", "wrap", "regular", "tiered", "relaxed", "straight"],
        "length": ["mini", "maxi", "midi", "knee", "floor", "gown", "cropped"],
        "occasion": ["casual", "party", "office", "vacation", "festive", "wedding", "date", "all"]
    }

# Safe import guard for PyTorch & Torchvision DLLs under Windows AppControl
TORCH_AVAILABLE = False
try:
    import torch
    import torch.nn as nn
    from torchvision import models, transforms
    from PIL import Image
    TORCH_AVAILABLE = True
except Exception as err:
    print(f"[*] Notice: Running vision extractor in safe standalone mode ({err}).")

if TORCH_AVAILABLE:
    try:
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
                        nn.Linear(128, len(vocab))
                    )
                    for attr, vocab in schema.items()
                })

            def forward(self, x):
                feats = self.backbone(x)
                return {attr: head(feats) for attr, head in self.heads.items()}

        img_transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
    except Exception as e:
        TORCH_AVAILABLE = False

_MODEL = None
_TRAINABLE_HEADS = None

def get_model(weights_path=None):
    global _MODEL, _TRAINABLE_HEADS
    if not TORCH_AVAILABLE:
        return None
    if _MODEL is None:
        try:
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            backbone_name = "resnet50"  # matches ml/train/config.yaml's default
            _TRAINABLE_HEADS = list(SCHEMA.keys())  # assume all trained until a checkpoint says otherwise

            if weights_path and os.path.exists(weights_path):
                try:
                    checkpoint = torch.load(weights_path, map_location=device)
                    # train_multitask.py saves {"model_state", "schema", "backbone",
                    # "trainable_heads"} — but accept a raw state_dict too, in case
                    # someone has an older-style checkpoint.
                    if isinstance(checkpoint, dict) and "model_state" in checkpoint:
                        backbone_name = checkpoint.get("backbone", backbone_name)
                        _TRAINABLE_HEADS = checkpoint.get("trainable_heads", _TRAINABLE_HEADS)
                        state_dict = checkpoint["model_state"]
                    else:
                        state_dict = checkpoint
                    model = StyleLoomMultiHeadResNet(SCHEMA, backbone_name=backbone_name)
                    model.load_state_dict(state_dict)
                except Exception as e:
                    print(f"[!] Warning loading weights: {e}")
                    model = StyleLoomMultiHeadResNet(SCHEMA, backbone_name=backbone_name)
            else:
                model = StyleLoomMultiHeadResNet(SCHEMA, backbone_name=backbone_name)

            model.to(device)
            model.eval()
            _MODEL = model
        except Exception as e:
            print(f"[!] Model init error: {e}")
            return None
    return _MODEL

def predict(image_path: str, weights: str | None = None) -> dict:
    if TORCH_AVAILABLE:
        model = get_model(weights)
        if model is not None:
            try:
                image = Image.open(image_path).convert('RGB')
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                tensor = img_transform(image).unsqueeze(0).to(device)

                with torch.no_grad():
                    outputs = model(tensor)

                results = {}
                for attr, logits in outputs.items():
                    # Per config.yaml's documented intent: a head trained on too few
                    # examples stays randomly initialized, so its prediction is
                    # meaningless — report it as unavailable instead of a confident
                    # -looking guess.
                    if _TRAINABLE_HEADS is not None and attr not in _TRAINABLE_HEADS:
                        results[attr] = None
                        continue
                    probs = torch.softmax(logits, dim=1)
                    idx = torch.argmax(probs, dim=1).item()
                    vocab = SCHEMA[attr]
                    results[attr] = vocab[idx % len(vocab)]

                return results
            except Exception as e:
                print(f"[!] PyTorch inference note: {e}")

    # No trained weights yet — mock prediction using real, matchable catalog
    # values (previously this hardcoded "emerald"/"chiffon silk", which could
    # never match anything in the real catalog vocabulary even by luck).
    return {
        "category": "dress",
        "color": "green",
        "pattern": "solid",
        "sleeve": "sleeveless",
        "neckline": "v-neck",
        "fabric": "chiffon",
        "fit": "a-line",
        "length": "maxi",
        "occasion": "party"
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--weights")
    args = ap.parse_args()
    print(json.dumps(predict(args.image, args.weights), indent=2))

if __name__ == "__main__":
    main()
