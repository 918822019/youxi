# Youxi · 战略战役切片

TypeScript + React + Vite + PixiJS 8 + Zustand 前端；Python + FastAPI 权威规则与脚本 AI 对手。当前是一张九省份地图的单人战役，不是完整的《钢铁雄心 4》。

## 启动

需要 Node.js 20.19+ 或 22.12+、Python 3.10+。在 `youxi` 根目录启动后端：

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8018
```

另开终端：

```bash
cd frontend
npm install
npm run dev
```

打开 http://127.0.0.1:5173/ 。开发模式把 `/api` 代理到 8018 端口。

## 玩法

- 地图上的九个相邻省份分属两国；点省份或左侧部队查看驻军、工厂、补给与可用军令。**按住地图上的我方部队标识拖到最终目的地**，拖动时会显示部队卡片、后端校验过的路线和无效目标原因；靠近地图边缘可自动平移，按 Esc 或松手在地图外取消。可以跨省自动寻路；也可以在地区指挥面板选部队和目的地。拖空白处平移地图，滚轮缩放。友方目标沿己方地区行军，进攻目标可逐省攻入敌方控制区。政治/军势地图模式、前线与在途军令均随战况更新。
- 我方与东境 AI 通过**同一套命令校验**征募、组建部队、调兵及进攻。每跨越一个省份需两天；多省份军令自动按段执行，交战会改变预计到达时间。途中战线改变时会重新寻路，无路可走或进攻失败则取消军令。战斗指挥面板可随时**取消正在执行的军令**（立即生效，同日可重新下令），或在地区指挥面板/地图拖放中给行军部队**改令**（当前路径重算，下一段额外耗时 1 日）。右侧可查看在途路线、预计到达和最近战报。全部占领即胜利。
- 可选择将国家工厂投入**装备或补给**。征募需要 20 金与 10 装备；部队每天消耗补给，断线或补给库存不足会减员，并无法从失联地区发起进攻。国库每天按拥有省份增加；只有接入指挥部的省份提供工厂产出。
- 点 `+1 日` 或播放按钮推进，速度按钮可在 1×/2×/3× 之间切换。AI 每天观察自己的局势，依据资源切换生产、集结和进攻；已有行军命令持续执行。
- 右侧 **保存 / 读取 / 重开** 操作进程内战役；存档写入 `backend/saves/campaign.json`（此目录被 Git 忽略）。重启服务后可读取该存档；重开不会删除已保存的进度。当前服务端同时只有一局，不支持多人和多存档槽。

## 项目结构

```text
youxi/
├── frontend/                 # React 游戏客户端
│   ├── src/app/              # 主界面与布局
│   ├── src/map/              # PixiJS 绘制、拖拽交互与省份几何
│   ├── src/ui/               # 战斗、地区、生产、奏报面板
│   ├── src/contracts/        # 玩家视图及命令类型
│   ├── src/network/          # 统一 API 请求
│   └── src/stores/           # 客户端选择与视图状态
├── backend/                  # FastAPI 游戏服务
│   ├── api/main.py           # HTTP 接口及存档文件管理
│   ├── core/models.py        # 游戏状态与命令的数据契约
│   ├── core/world.py         # 战役地图、邻接与常量
│   ├── core/game.py          # 权威结算、行军、战斗与存档快照
│   ├── agents/scripted.py    # AI 国家决策器
│   ├── tests/                # 规则及接口测试
│   └── saves/                # 运行时存档（Git 忽略）
└── README.md
```

地图坐标与形状在 `frontend/src/map/geometry.ts`，权威省份归属与通行规则在 `backend/core/world.py` / `game.py`；客户端只负责展示和提交命令。

调试 AI：启动后端时设置 `YOUXI_DEBUG_AI=1`，前端开发模式会显示 AI 的观察、计划、提交命令与校验结果。

```bash
YOUXI_DEBUG_AI=1 backend/.venv/bin/uvicorn backend.api.main:app --reload --port 8018
```

验证规则：`PYTHONPATH=. python3 -m unittest discover -s backend/tests`；前端构建：在 `frontend` 目录执行 `npm run build`。

目前地形只用于地图表现，没有地形战斗修正；外交、科技、海空军、复杂路径和真正的持续时间模拟仍待实现。玩家与 AI 的计划不互相暴露，敌军只在相邻地区可见。当前版本也可以读取上一版本的单局存档，缺失的路线会在下一游戏日重新规划。
