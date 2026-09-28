# Training notes

Baseline: ResNet-50 backbone (ImageNet-pretrained) with one classification
head per attribute in `label_schema.json`. Total heads = 9.

## Loss

Masked cross-entropy: for each example, sum CE loss only over attributes with
non-null labels. Attributes never labeled contribute zero gradient — their
heads remain at initialization. This is deliberate.

## Reference training loop

```python
import torch, torch.nn as nn
from torch.utils.data import DataLoader
from torchvision.models import resnet50, ResNet50_Weights

class MultiHead(nn.Module):
    def __init__(self, schema):
        super().__init__()
        base = resnet50(weights=ResNet50_Weights.IMAGENET1K_V2)
        self.backbone = nn.Sequential(*list(base.children())[:-1])
        self.heads = nn.ModuleDict({
            a: nn.Linear(2048, len(vals)) for a, vals in schema.items()
        })
    def forward(self, x):
        f = self.backbone(x).flatten(1)
        return {a: h(f) for a, h in self.heads.items()}
```

For each batch, compute per-head CE only where labels != -1 (encoded null).

## Evaluation

Report top-1 accuracy per attribute AND per-attribute macro-F1 to catch
class-imbalance blind spots. Don't average across attributes — the "needs
labels" heads will not have meaningful metrics.

## Serving

Export TorchScript, load in `serve/api.py`, deploy behind a GPU worker. Set
env `STYLELOOM_MODEL_WEIGHTS` and point the web app's future
`vision_predict` server function at the endpoint.
