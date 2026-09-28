# Attributes — realistic status

This pipeline targets 9 fashion attributes. Public datasets (DeepFashion,
DeepFashion2, Fashion-MNIST, iMaterialist) cover them unevenly.

| Attribute | Status | What's needed for reliable inference |
| --- | --- | --- |
| category | trainable now | DeepFashion category labels are enough |
| color | trainable now | dominant color via k-means + label mapping |
| pattern | partial | ~50% of DeepFashion-Attribute has usable pattern labels; expect noise |
| fabric | partial | text-derived labels from product descriptions; visual signal is weaker |
| sleeve | partial | present in DeepFashion-Attribute; class imbalance |
| neckline | **needs labels** | not well-covered in public data; recommend 3–5k crowdsourced labels |
| fit | partial | derivable from silhouette segmentation; needs class balancing |
| length | derivable | can be derived from pose keypoints + garment bbox |
| occasion | **needs labels** | subjective; consider weak supervision from product metadata |

Heads for attributes marked "needs labels" are constructed by the pipeline but
frozen (see `train/train_multitask.py` `min_labeled_examples`). At inference,
`predict.py` returns `"unknown"` for them — the app treats missing keys as
"no preference for that attribute," so honesty here is safer than guessing.
