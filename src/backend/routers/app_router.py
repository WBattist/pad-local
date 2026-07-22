import os
import json
import time

from fastapi import APIRouter
from config import STATIC_DIR
from database.database import engine
from cache import RedisClient
from sqlalchemy import text

app_router = APIRouter()

# TODO: Add build info back in
# @app_router.get("/build-info")
# async def get_build_info():
#     """
#     Return the current build information from the static assets
#     """
#     try:
#         # Read the build-info.json file that will be generated during build
#         build_info_path = os.path.join(STATIC_DIR, "build-info.json")
#         with open(build_info_path, 'r') as f:
#             build_info = json.load(f)
#         return build_info
#     except Exception as e:
#         # Return a default response if file doesn't exist
#         print(f"Error reading build-info.json: {str(e)}")
#         return {"buildHash": "development", "timestamp": int(time.time())}

@app_router.get("/config")
async def get_app_config():
    """
    Return runtime configuration for the frontend
    """
    return {
        "coderUrl": os.getenv("CODER_PUBLIC_URL", os.getenv("CODER_URL", "")),
        "posthogKey": os.getenv("VITE_PUBLIC_POSTHOG_KEY", ""),
        "posthogHost": os.getenv("VITE_PUBLIC_POSTHOG_HOST", ""),
        "devMode": os.getenv("PAD_DEV_MODE", "false") == "true",
    }

@app_router.get("/health")
async def health():
    """Readiness check covering the two stateful dependencies Pad requires."""
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
    redis = await RedisClient.get_instance()
    await redis.ping()
    return {"status": "ok"}
