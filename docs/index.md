# Youxi · 战略战役切片

TypeScript + React + Vite + PixiJS 8 + Zustand 前端；Python + FastAPI 权威规则与脚本 AI 对手。当前是一张**九省份地图的单人战役**，不是完整的《钢铁雄心 4》。

## 文档范围

本站在代码之外，集中说明**可被玩家观测到的结算规则**：行军、战斗、经济、生产与补给。地图坐标与形状在 `frontend/src/map/geometry.ts`，权威省份归属与通行规则在 `backend/core/world.py` / `game.py`。

!!! warning "代码是唯一真源"
    这里描述的是当前实现。任何规则改动都应先改 `backend/core/`，再回来同步本页；数值常量（如 `COST_GOLD`、`TRAVEL_DAYS`）以代码为准。

## 快速开始

```bash
# 后端
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8018

# 前端（另开终端）
cd frontend
npm install
npm run dev
```

打开 <http://127.0.0.1:5173/>。开发模式把 `/api` 代理到 8018 端口。Windows 见[开发指南](development.md)。

## 规则入口

- [地图与势力](rules/world.md) —— 省份、邻接、指挥部、开局数值
- [行军与军令](rules/movement.md) —— 路径、耗时、改令与重规划
- [战斗结算](rules/combat.md) —— 进攻成败判定与损失
- [经济与生产](rules/economy.md) —— 国库、工厂、征募
- [补给与失联](rules/supply.md) —— 补给网、日耗与断供
