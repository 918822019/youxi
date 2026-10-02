"""Scripted opponent acting through exactly the same command gateway as the player."""

from collections import deque

from backend.core.models import Command, PlayerView


def _towards_front(start: str, own: dict, enemies: dict) -> str | None:
    queue = deque([start])
    visited = {start}
    while queue:
        city_id = queue.popleft()
        city = own[city_id]
        if any(neighbor in enemies for neighbor in city.neighbors):
            return city_id
        for neighbor in city.neighbors:
            if neighbor in own and neighbor not in visited and own[neighbor].supplied:
                visited.add(neighbor)
                queue.append(neighbor)
    return None


def decide(view: PlayerView, previous_plan: str) -> tuple[str, list[Command]]:
    own = {city.id: city for city in view.cities if city.owner == view.country}
    enemy = {city.id: city for city in view.cities if city.owner != view.country}
    armies = [unit for unit in view.units if unit.owner == view.country]
    if not own:
        return "失去所有地区", [Command(type="hold")]
    if not armies:
        base = next((city for city in own.values() if city.supplied and any(id in enemy for id in city.neighbors)), None)
        if base and view.gold >= 20 and view.equipment >= 10:
            return f"在{base.name}重建陆军", [Command(type="recruit", cityId=base.id)]
        if view.production != "equipment" and view.equipment < 10:
            return "优先生产装备重建陆军", [Command(type="set_production", focus="equipment")]
        return "守住剩余地区，等待增援", [Command(type="hold")]
    commands: list[Command] = []
    focus = "supplies" if view.supplies < 16 else "equipment"
    if focus != view.production:
        commands.append(Command(type="set_production", focus=focus))
    goals = []
    gold = view.gold
    equipment = view.equipment
    for army in armies:
        if army.order or army.cityId not in own:
            continue
        current = own[army.cityId]
        if not current.supplied:
            goals.append(f"{army.name}补给线中断")
            continue
        targets = [enemy[id] for id in current.neighbors if id in enemy]
        if targets:
            # Capturing the enemy's HQ is strategically valuable; otherwise prefer a weaker target.
            targets.sort(key=lambda city: (city.id != "capital", (city.garrison or 10) + sum((unit.strength or 0) for unit in view.units if unit.owner != view.country and unit.cityId == city.id)))
            target = targets[0]
            defenders = sum((unit.strength or 0) for unit in view.units if unit.owner != view.country and unit.cityId == target.id)
            required = (target.garrison or 10) + defenders + 3
            if (army.strength or 0) < required and gold >= 20 and equipment >= 10:
                commands.append(Command(type="recruit", cityId=current.id, unitId=army.id))
                gold -= 20
                equipment -= 10
                goals.append(f"{army.name}集结于{current.name}")
            elif (army.strength or 0) >= required or gold < 20:
                commands.append(Command(type="attack", unitId=army.id, targetId=target.id))
                goals.append(f"{army.name}向{target.name}进攻")
            else:
                goals.append(f"{army.name}等待装备到位")
        else:
            next_city = _towards_front(army.cityId, own, enemy)
            if next_city:
                commands.append(Command(type="move", unitId=army.id, targetId=next_city))
                goals.append(f"{army.name}向前线调动")
    if not commands:
        commands.append(Command(type="hold"))
        return previous_plan or "维持既定部署", commands
    return "；".join(goals) or f"调整工业生产：{focus}", commands[:10]
