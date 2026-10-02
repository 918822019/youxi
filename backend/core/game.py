"""Deterministic authoritative campaign simulation."""

from collections import deque
from heapq import heappop, heappush
from threading import Lock
from typing import Literal

from backend.core.models import (
    CityView, Command, CommandResult, CountryId, PlayerView, Production, Report, RoutePreview, UnitView,
)
from backend.core.world import BOARD, COST_EQUIPMENT, COST_GOLD, HEADQUARTERS, IDS, NEIGHBORS, TRAVEL_DAYS


class Game:
    def __init__(self) -> None:
        self._lock = Lock()
        self._turn = 1
        self._gold: dict[CountryId, int] = {"player": 100, "rival": 100}
        self._equipment: dict[CountryId, int] = {"player": 30, "rival": 30}
        self._supplies: dict[CountryId, int] = {"player": 35, "rival": 35}
        self._production: dict[CountryId, Production] = {"player": "equipment", "rival": "equipment"}
        self._cities = {
            id: CityView(id=id, name=name, owner=owner, x=x, y=y, garrison=10,
                         factories=factories, description=description, neighbors=list(NEIGHBORS[id]))
            for id, name, owner, x, y, factories, description in BOARD
        }
        self._cities["capital"].garrison = 12
        self._cities["east"].garrison = 8
        self._units = {
            "first": UnitView(id="first", name="第一军", owner="player", cityId="capital", strength=30),
            "second": UnitView(id="second", name="边防军", owner="player", cityId="west", strength=20),
            "third": UnitView(id="third", name="北方军", owner="player", cityId="north", strength=22),
            "east_army": UnitView(id="east_army", name="东境军", owner="rival", cityId="east", strength=25),
            "south_army": UnitView(id="south_army", name="南方军", owner="rival", cityId="south", strength=22),
            "north_army": UnitView(id="north_army", name="边境军", owner="rival", cityId="northeast", strength=18),
        }
        self._reports: dict[CountryId, list[Report]] = {"player": [], "rival": []}
        self._results: dict[CountryId, list[CommandResult]] = {"player": [], "rival": []}
        self._log("player", "边境进入战争状态。生产装备与补给，调动部队夺取敌方地区。")
        self._log("rival", "东境军已集结，王都位于西方。")
        self._ai_plan = "尚未制定计划"
        self._ai_observation: PlayerView | None = None
        self._ai_commands: list[Command] = []
        self._ai_results: list[CommandResult] = []

    def _log(self, country: CountryId, text: str) -> None:
        self._reports[country].append(Report(id=len(self._reports[country]) + 1, turn=self._turn, text=text))

    def _supply_network(self, country: CountryId) -> set[str]:
        owned = {id for id, city in self._cities.items() if city.owner == country}
        if not owned:
            return set()
        # If the original HQ falls, command relocates to the first remaining province.
        source = HEADQUARTERS[country] if HEADQUARTERS[country] in owned else next(id for id in IDS if id in owned)
        connected = {source}
        queue = deque([source])
        while queue:
            for neighbor in NEIGHBORS[queue.popleft()]:
                if neighbor in owned and neighbor not in connected:
                    connected.add(neighbor)
                    queue.append(neighbor)
        return connected

    def _visible(self, observer: CountryId, city_id: str) -> bool:
        return self._cities[city_id].owner == observer or any(
            self._cities[neighbor].owner == observer for neighbor in NEIGHBORS[city_id]
        )

    def _view(self, country: CountryId) -> PlayerView:
        supply = {side: self._supply_network(side) for side in ("player", "rival")}
        cities = [city.model_copy(update={
            "garrison": city.garrison if self._visible(country, city.id) else None,
            "supplied": city.id in supply[city.owner] if city.owner == country else None,
        }) for city in self._cities.values()]
        units = []
        for unit in self._units.values():
            if unit.owner != country and not self._visible(country, unit.cityId):
                continue
            units.append(unit.model_copy(update={
                "strength": unit.strength if self._visible(country, unit.cityId) else None,
                "supplied": unit.cityId in supply[unit.owner] if unit.owner == country else None,
                "targetId": unit.targetId if unit.owner == country else None,
                "order": unit.order if unit.owner == country else None,
                "daysRemaining": unit.daysRemaining if unit.owner == country else 0,
                "route": list(unit.route) if unit.owner == country else [],
            }))
        owners = {city.owner for city in self._cities.values()}
        winner = next(iter(owners)) if len(owners) == 1 else None
        return PlayerView(
            country=country, winner=winner, turn=self._turn, gold=self._gold[country],
            equipment=self._equipment[country], supplies=self._supplies[country],
            factories=sum(city.factories for city in self._cities.values() if city.owner == country),
            production=self._production[country], cities=cities, units=units,
            reports=[report.model_copy() for report in self._reports[country][-30:]],
            commandResults=[result.model_copy(deep=True) for result in self._results[country]],
        )

    def view(self, country: CountryId = "player") -> PlayerView:
        with self._lock:
            return self._view(country)

    def _route(self, actor: CountryId, start: str, target: str, action: Literal["move", "attack"]) -> list[str] | None:
        """Dijkstra: staging through owned provinces is cheaper than conquering enemy land."""
        if start not in self._cities or target not in self._cities or start == target:
            return None
        if action == "move" and self._cities[target].owner != actor:
            return None
        if action == "attack" and self._cities[target].owner == actor:
            return None
        queue: list[tuple[int, int, tuple[str, ...], str]] = [(0, 0, (), start)]
        best: dict[str, tuple[int, int]] = {start: (0, 0)}
        while queue:
            cost, hops, path, current = heappop(queue)
            if (cost, hops) != best[current]:
                continue
            if current == target:
                return list(path)
            for neighbor in NEIGHBORS[current]:
                if action == "move" and self._cities[neighbor].owner != actor:
                    continue
                # An offensive path may stage in friendly land or conquer enemy provinces.
                weight = 1 if self._cities[neighbor].owner == actor else 4
                score = (cost + weight, hops + 1)
                if score < best.get(neighbor, (10**9, 10**9)):
                    best[neighbor] = score
                    heappush(queue, (*score, (*path, neighbor), neighbor))
        return None

    def _clear_order(self, unit: UnitView) -> None:
        unit.targetId = None
        unit.order = None
        unit.daysRemaining = 0
        unit.route = []

    def _plan_order(
        self, actor: CountryId, command: Command,
    ) -> tuple[tuple[UnitView, CityView, Literal["move", "attack"], list[str]] | None, str]:
        """Single source of truth for command acceptance and read-only drag previews."""
        if len({city.owner for city in self._cities.values()}) == 1:
            return None, "对局已结束"
        unit = self._units.get(command.unitId or "")
        if unit is None or unit.owner != actor:
            return None, "只能指挥本国部队"
        target = self._cities.get(command.targetId or "")
        if target is None:
            return None, "目标不存在"
        if command.type == "redirect":
            if unit.order is None:
                return None, "部队没有需要更改的军令"
            if unit.targetId == target.id:
                return None, "新目标与现有目标相同"
            action: Literal["move", "attack"] = "move" if target.owner == actor else "attack"
        elif command.type in ("move", "attack"):
            if unit.order is not None:
                return None, "部队已有正在执行的命令，请先取消或改令"
            action = command.type
        else:
            return None, "不支持的军令"
        if action == "move" and target.owner != actor:
            return None, "调动只能前往本国城池"
        if action == "attack" and target.owner == actor:
            return None, "进攻目标必须属于敌国"
        if action == "attack" and unit.cityId not in self._supply_network(actor):
            return None, "部队补给线中断，无法发动进攻"
        route = self._route(actor, unit.cityId, target.id, action)
        if route is None:
            return None, "当前战线下目标不可达"
        return (unit, target, action, route), "路线可用"

    def preview_order(self, actor: CountryId, unit_id: str, target_id: str) -> RoutePreview:
        with self._lock:
            unit = self._units.get(unit_id)
            target = self._cities.get(target_id)
            action = "redirect" if unit and unit.order else "move" if target and target.owner == actor else "attack"
            plan, reason = self._plan_order(actor, Command(type=action, unitId=unit_id, targetId=target_id))
            if plan is None:
                return RoutePreview(unitId=unit_id, targetId=target_id, valid=False, reason=reason)
            _, _, movement, route = plan
            names = " → ".join(self._cities[id].name for id in route)
            return RoutePreview(
                unitId=unit_id, targetId=target_id, valid=True, action=movement,
                route=route, eta=len(route) * TRAVEL_DAYS + (1 if action == "redirect" else 0),
                reason=f"{names} · 预计 {len(route) * TRAVEL_DAYS + (1 if action == 'redirect' else 0)} 日",
            )

    def _apply(self, actor: CountryId, command: Command) -> CommandResult:
        def reject(reason: str) -> CommandResult:
            return CommandResult(command=command, accepted=False, reason=reason)

        if len({city.owner for city in self._cities.values()}) == 1:
            return reject("对局已结束")
        if command.type == "hold":
            return CommandResult(command=command, accepted=True, reason="维持现有命令")
        if command.type == "set_production":
            if command.focus is None:
                return reject("生产目标无效")
            self._production[actor] = command.focus
            return CommandResult(command=command, accepted=True, reason=f"已将产能投入{'装备' if command.focus == 'equipment' else '补给'}")
        if command.type == "recruit":
            city = self._cities.get(command.cityId or "")
            if city is None or city.owner != actor:
                return reject("只能在本国城池征募")
            if city.id not in self._supply_network(actor):
                return reject("该城与指挥部失联，无法征募")
            if self._gold[actor] < COST_GOLD or self._equipment[actor] < COST_EQUIPMENT:
                return reject("需要 20 金与 10 装备")
            idle = next((unit for unit in self._units.values() if unit.owner == actor and unit.cityId == city.id and unit.order is None and (command.unitId is None or command.unitId == unit.id)), None)
            if command.unitId is not None and idle is None:
                return reject("只能征募本国该城的待命部队")
            self._gold[actor] -= COST_GOLD
            self._equipment[actor] -= COST_EQUIPMENT
            if idle is None:
                number = 1
                while f"{actor}_reserve_{number}" in self._units:
                    number += 1
                idle = UnitView(id=f"{actor}_reserve_{number}", name=f"第{number}后备军", owner=actor, cityId=city.id, strength=10)
                self._units[idle.id] = idle
                self._log(actor, f"{city.name}组建{idle.name}，消耗 20 金与 10 装备。")
                return CommandResult(command=command, accepted=True, reason=f"{idle.name}已在{city.name}组建")
            assert idle.strength is not None
            idle.strength += 10
            self._log(actor, f"{city.name}征募完成：{idle.name}增加 10 人，消耗 20 金与 10 装备。")
            return CommandResult(command=command, accepted=True, reason=f"{idle.name}兵力增加 10")
        if command.type == "cancel_order":
            unit = self._units.get(command.unitId or "")
            if unit is None or unit.owner != actor:
                return reject("只能指挥本国部队")
            if unit.order is None:
                return reject("部队没有正在执行的军令")
            self._clear_order(unit)
            self._log(actor, f"{unit.name}军令已取消，部队留在{self._cities[unit.cityId].name}。")
            return CommandResult(command=command, accepted=True, reason=f"{unit.name}军令已立即取消，可重新下令")
        plan, reason = self._plan_order(actor, command)
        if plan is None:
            return reject(reason)
        unit, target, action, route = plan
        unit.targetId = target.id
        unit.order = action
        unit.route = route
        unit.daysRemaining = TRAVEL_DAYS + (1 if command.type == "redirect" else 0)
        names = " → ".join(self._cities[id].name for id in route)
        delay = "；改令额外耗时 1 日" if command.type == "redirect" else ""
        return CommandResult(command=command, accepted=True, reason=f"{unit.name}路线：{names}（预计 {unit.daysRemaining + (len(route)-1) * TRAVEL_DAYS} 日{delay}，交战可能延迟）")

    def _submit(self, actor: CountryId, commands: list[Command]) -> list[CommandResult]:
        # Sequential current-state validation shares gold, equipment and unit availability.
        results = [self._apply(actor, command) for command in commands]
        self._results[actor] = results
        return results

    def submit(self, actor: CountryId, commands: list[Command]) -> PlayerView:
        with self._lock:
            self._submit(actor, commands)
            return self._view(actor)

    def _resolve_orders(self) -> None:
        for unit in list(self._units.values()):
            if unit.id not in self._units:
                continue
            if unit.order is None:
                continue
            target_id = unit.targetId
            if target_id is None or target_id not in self._cities:
                self._clear_order(unit)
                continue
            route = self._route(unit.owner, unit.cityId, target_id, unit.order)
            if route is None or (unit.order == "attack" and unit.cityId not in self._supply_network(unit.owner)):
                self._log(unit.owner, f"{unit.name}前往{self._cities[target_id].name}的路线被切断，军令已取消。")
                self._clear_order(unit)
                continue
            if route != unit.route:
                unit.route = route
                unit.daysRemaining = TRAVEL_DAYS
                self._log(unit.owner, f"{unit.name}因战线变化重新规划路线。")
            unit.daysRemaining -= 1
            if unit.daysRemaining > 0:
                continue
            next_id = unit.route[0]
            destination = self._cities[next_id]
            if destination.owner == unit.owner:
                unit.cityId = next_id
                unit.route.pop(0)
                self._log(unit.owner, f"{unit.name}已抵达{destination.name}。")
            else:
                defenders = [other for other in self._units.values() if other.owner == destination.owner and other.cityId == next_id]
                defender_supply = self._supply_network(destination.owner)
                defense = (destination.garrison or 0) + sum(
                    (other.strength or 0) if next_id in defender_supply else int((other.strength or 0) * 0.6)
                    for other in defenders
                )
                assert unit.strength is not None
                attack = unit.strength if unit.cityId in self._supply_network(unit.owner) else int(unit.strength * 0.6)
                if attack > defense:
                    former_owner = destination.owner
                    unit.strength = max(1, unit.strength - max(1, defense // 2))
                    for other in defenders:
                        del self._units[other.id]
                    destination.owner = unit.owner
                    destination.garrison = 5
                    unit.cityId = next_id
                    unit.route.pop(0)
                    for country in ("player", "rival"):
                        self._log(country, f"{unit.name}攻占{destination.name}。")
                    self._log(former_owner, f"{destination.name}已失守。")
                else:
                    unit.strength = max(0, unit.strength - max(2, defense // 4))
                    for defender in defenders:
                        defender.strength = max(1, (defender.strength or 0) - max(1, attack // 6))
                    if unit.strength == 0:
                        del self._units[unit.id]
                    else:
                        self._clear_order(unit)
                    for country in ("player", "rival"):
                        self._log(country, f"{unit.name}进攻{destination.name}失败，军令终止。")
                    continue
            if unit.cityId == target_id:
                self._clear_order(unit)
            else:
                # On the next day a changed front may select a better remaining path.
                unit.daysRemaining = TRAVEL_DAYS

    def _economy(self) -> None:
        for actor in ("player", "rival"):
            owned = [city for city in self._cities.values() if city.owner == actor]
            self._gold[actor] += len(owned)
            factories = sum(city.factories for city in owned if city.id in self._supply_network(actor))
            if self._production[actor] == "equipment":
                self._equipment[actor] += factories * 2
            else:
                self._supplies[actor] += factories * 2
            for unit in list(self._units.values()):
                if unit.owner != actor:
                    continue
                cost = max(1, ((unit.strength or 0) + 19) // 20) + (1 if unit.order else 0)
                if unit.cityId in self._supply_network(actor) and self._supplies[actor] >= cost:
                    self._supplies[actor] -= cost
                else:
                    unit.strength = max(1, (unit.strength or 1) - 2)
                    self._log(actor, f"{unit.name}补给不足，损失 2 人。")

    def advance_day(self) -> PlayerView:
        from backend.agents.scripted import decide

        with self._lock:
            if len({city.owner for city in self._cities.values()}) == 1:
                return self._view("player")
            self._ai_observation = self._view("rival")
            plan, commands = decide(self._ai_observation, self._ai_plan)
            self._ai_plan = plan
            self._ai_commands = commands
            self._ai_results = self._submit("rival", commands)
            self._turn += 1
            self._economy()
            self._resolve_orders()
            return self._view("player")

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "version": 2, "turn": self._turn, "gold": self._gold.copy(),
                "equipment": self._equipment.copy(), "supplies": self._supplies.copy(),
                "production": self._production.copy(),
                "cities": [city.model_dump() for city in self._cities.values()],
                "units": [unit.model_dump() for unit in self._units.values()],
                "reports": {side: [report.model_dump() for report in logs] for side, logs in self._reports.items()},
                "results": {side: [result.model_dump() for result in logs] for side, logs in self._results.items()},
                "aiPlan": self._ai_plan,
            }

    @classmethod
    def from_snapshot(cls, data: dict) -> "Game":
        if not isinstance(data, dict) or data.get("version") not in (1, 2):
            raise ValueError("存档版本不兼容")
        game = cls()
        game._turn = int(data["turn"])
        if game._turn < 1:
            raise ValueError("存档回合无效")
        game._gold = {side: int(data["gold"][side]) for side in ("player", "rival")}
        game._equipment = {side: int(data["equipment"][side]) for side in ("player", "rival")}
        game._supplies = {side: int(data["supplies"][side]) for side in ("player", "rival")}
        game._production = {side: data["production"][side] for side in ("player", "rival")}
        if any(value < 0 for values in (game._gold, game._equipment, game._supplies) for value in values.values()):
            raise ValueError("存档资源无效")
        if any(value not in ("equipment", "supplies") for value in game._production.values()):
            raise ValueError("存档生产设置无效")
        game._cities = {city.id: city for city in (CityView.model_validate(item) for item in data["cities"])}
        if set(game._cities) != set(IDS) or any(city.owner not in ("player", "rival") or city.garrison is None or city.garrison < 0 for city in game._cities.values()):
            raise ValueError("存档地区无效")
        game._units = {unit.id: unit for unit in (UnitView.model_validate(item) for item in data["units"])}
        if any(unit.cityId not in game._cities or unit.strength is None or unit.strength < 1 or (unit.targetId is not None and unit.targetId not in game._cities) for unit in game._units.values()):
            raise ValueError("存档部队无效")
        game._reports = {side: [Report.model_validate(item) for item in data["reports"][side]] for side in ("player", "rival")}
        game._results = {side: [CommandResult.model_validate(item) for item in data["results"][side]] for side in ("player", "rival")}
        game._ai_plan = str(data["aiPlan"])
        return game

    def debug_ai(self) -> dict:
        with self._lock:
            return {
                "observation": self._ai_observation.model_dump() if self._ai_observation else None,
                "plan": self._ai_plan,
                "commands": [command.model_dump() for command in self._ai_commands],
                "results": [result.model_dump() for result in self._ai_results],
                "currentOrders": [unit.model_dump() for unit in self._units.values() if unit.owner == "rival"],
            }
