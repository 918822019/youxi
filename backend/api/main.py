import json
import os
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException

from backend.core.game import Game
from backend.core.models import Command, CommandBatch, PlayerView, RoutePreview

app = FastAPI(title="Youxi Campaign API")
game = Game()
session_lock = Lock()
SAVE_FILE = Path(__file__).resolve().parents[1] / "saves" / "campaign.json"


@app.get("/api/view", response_model=PlayerView)
def get_view() -> PlayerView:
    with session_lock:
        return game.view("player")


@app.post("/api/commands", response_model=PlayerView)
def submit_command(payload: Command | CommandBatch) -> PlayerView:
    commands = payload.commands if isinstance(payload, CommandBatch) else [payload]
    with session_lock:
        return game.submit("player", commands)


@app.get("/api/route-preview", response_model=RoutePreview)
def preview_route(unitId: str, targetId: str) -> RoutePreview:
    with session_lock:
        return game.preview_order("player", unitId, targetId)


@app.post("/api/day", response_model=PlayerView)
def advance_day() -> PlayerView:
    with session_lock:
        return game.advance_day()


@app.post("/api/save")
def save_campaign() -> dict:
    with session_lock:
        SAVE_FILE.parent.mkdir(parents=True, exist_ok=True)
        pending = SAVE_FILE.with_suffix(".tmp")
        pending.write_text(json.dumps(game.snapshot(), ensure_ascii=False), encoding="utf-8")
        pending.replace(SAVE_FILE)
    return {"saved": True}


@app.post("/api/load", response_model=PlayerView)
def load_campaign() -> PlayerView:
    global game
    with session_lock:
        if not SAVE_FILE.exists():
            raise HTTPException(status_code=404, detail="尚无战役存档")
        try:
            restored = Game.from_snapshot(json.loads(SAVE_FILE.read_text(encoding="utf-8")))
        except (ValueError, KeyError, TypeError) as error:
            raise HTTPException(status_code=400, detail="存档损坏或版本不兼容") from error
        game = restored
        return game.view("player")


@app.post("/api/reset", response_model=PlayerView)
def reset_campaign() -> PlayerView:
    global game
    with session_lock:
        game = Game()
        return game.view("player")


@app.get("/api/debug/ai")
def debug_ai() -> dict:
    if os.environ.get("YOUXI_DEBUG_AI") != "1":
        raise HTTPException(status_code=404, detail="Not found")
    with session_lock:
        return game.debug_ai()
