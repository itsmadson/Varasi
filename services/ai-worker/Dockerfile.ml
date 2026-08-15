# ai-worker "ML" image variant — the light image plus the CPU deep-learning tier
# (DeepForest today; drop more model deps here as adapters are activated). Build
# only when a host can afford the extra ~1.5 GB; the default Dockerfile stays lean
# and the model registry gates these backends on import availability.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    MODEL_WEIGHTS_DIR=/models

RUN apt-get update && apt-get install -y --no-install-recommends \
      libexpat1 libtiff6 libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY varasi_ai ./varasi_ai
RUN pip install .
# CPU deep-learning tier. torch CPU wheels + DeepForest (downloads release weights
# at first use). Kept out of the base image to avoid bloating GPU-less deploys.
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu \
      "torch==2.3.1" "torchvision==0.18.1" && \
    pip install "deepforest==1.4.1" && \
    pip install "albumentations==1.3.1"   # deepforest 1.4.1 needs albumentations.functional (removed in ≥1.4)

# Optional mount point for GPU/segment model checkpoints.
VOLUME ["/models"]

EXPOSE 8090
CMD ["uvicorn", "varasi_ai.main:app", "--host", "0.0.0.0", "--port", "8090"]
