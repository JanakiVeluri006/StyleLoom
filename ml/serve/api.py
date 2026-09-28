import sys
import tempfile
import json
from pathlib import Path
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

# Ensure parent directory is in sys.path for inference imports
ml_root = Path(__file__).parents[1]
if str(ml_root) not in sys.path:
    sys.path.insert(0, str(ml_root))

from inference.predict import predict, SCHEMA

app = FastAPI(title="StyleLoom Vision Classification API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "StyleLoom Vision Extraction API",
        "supported_attributes": list(SCHEMA.keys())
    }

@app.get("/health")
def health():
    return {"ok": True, "attributes": list(SCHEMA.keys())}

@app.post("/predict")
async def predict_endpoint(image: UploadFile = File(...)):
    contents = await image.read()
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name
        
    result = predict(tmp_path)
    
    # Format into bucket dictionary expected by StyleLoom frontend: { attr: [value] }
    attrs = {k: [v] for k, v in result.items() if v and v != "unknown"}
    
    return {
        "success": True,
        "attributes": attrs,
        "raw_predictions": result
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
