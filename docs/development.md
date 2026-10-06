# 开发指南

## 环境要求

- Node.js 20.19+ 或 22.12+（Vite 7 要求）
- Python 3.10+

## 后端

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8018
```

Windows 用 `backend\.venv\Scripts\` 下的可执行文件：

```powershell
python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
backend\.venv\Scripts\python.exe -m uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8018
```

### 一键热重载

仓库根目录的 `dev.ps1` 会同时开两个窗口启动后端（`--reload`）与前端（Vite HMR）：

```powershell
.\dev.ps1
```

执行策略受限时：`powershell -ExecutionPolicy Bypass -File .\dev.ps1`。

## 前端

```bash
cd frontend
npm install
npm run dev      # 开发（HMR）
npm run build    # 类型检查 + 生产构建
```

打开 <http://127.0.0.1:5173/>，开发模式把 `/api` 代理到 8018。

## 测试与校验

```bash
# 后端规则与接口测试
PYTHONPATH=. python3 -m unittest discover -s backend/tests

# 前端构建（含 tsc 类型检查）
cd frontend && npm run build
```

!!! note
    接口测试依赖 `httpx2`（starlette 测试客户端需要），它不在 `backend/requirements.txt` 中，测试环境需单独安装。

## 调试 AI

启动后端前设置 `YOUXI_DEBUG_AI=1`，前端开发模式会显示 AI 的观察、计划、提交命令与校验结果：

```bash
YOUXI_DEBUG_AI=1 backend/.venv/bin/uvicorn backend.api.main:app --reload --port 8018
```

调试接口：`GET /api/debug/ai`（仅在上述环境变量为 `1` 时可用）。

## API 概览

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/view` | 玩家视图 |
| POST | `/api/commands` | 提交单条或批量命令 |
| GET | `/api/route-preview` | 拖放路径预览 |
| POST | `/api/day` | 推进一天 |
| POST | `/api/save` | 存档到 `backend/saves/campaign.json` |
| POST | `/api/load` | 读取存档 |
| POST | `/api/reset` | 重开 |
| GET | `/api/debug/ai` | AI 调试（需 `YOUXI_DEBUG_AI=1`） |

## 构建本文档

```bash
pip install -r docs/requirements.txt
mkdocs serve     # 本地预览 http://127.0.0.1:8000
mkdocs build     # 输出到 site/
```

推送到 `master` 后由 `.github/workflows/deploy-docs.yml` 自动发布到 GitHub Pages。
