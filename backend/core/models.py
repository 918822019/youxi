"""Wire-level game contracts and authoritative state records."""

from typing import Literal

from pydantic import BaseModel, Field

CountryId = Literal["player", "rival"]
Production = Literal["equipment", "supplies"]
Action = Literal["recruit", "move", "attack", "hold", "set_production", "cancel_order", "redirect"]


class CityView(BaseModel):
    id: str
    name: str
    x: int
    y: int
    owner: CountryId
    garrison: int | None
    factories: int
    supplied: bool | None = None
    description: str
    neighbors: list[str]


class UnitView(BaseModel):
    id: str
    name: str
    owner: CountryId
    cityId: str
    strength: int | None
    supplied: bool | None = None
    targetId: str | None = None
    order: Literal["move", "attack"] | None = None
    daysRemaining: int = 0
    route: list[str] = Field(default_factory=list)


class Report(BaseModel):
    id: int
    turn: int
    text: str


class Command(BaseModel):
    type: Action
    cityId: str | None = None
    unitId: str | None = None
    targetId: str | None = None
    focus: Production | None = None


class CommandResult(BaseModel):
    command: Command
    accepted: bool
    reason: str


class PlayerView(BaseModel):
    country: CountryId
    winner: CountryId | None
    turn: int
    gold: int
    equipment: int
    supplies: int
    factories: int
    production: Production
    cities: list[CityView]
    units: list[UnitView]
    reports: list[Report]
    commandResults: list[CommandResult]


class CommandBatch(BaseModel):
    commands: list[Command] = Field(min_length=1, max_length=10)



class RoutePreview(BaseModel):
    unitId: str
    targetId: str
    valid: bool
    action: Literal["move", "attack"] | None = None
    route: list[str] = Field(default_factory=list)
    eta: int | None = None
    reason: str
