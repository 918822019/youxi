"""Nine-province campaign setup and adjacency rules."""

from backend.core.models import CountryId

COST_GOLD = 20
COST_EQUIPMENT = 10
TRAVEL_DAYS = 2

# Row-major board. Adjacent provinces share land borders; all coordinates are map-space.
BOARD = [
    ("highlands", "石岭", "player", 215, 160, 1, "北部山脉，通道狭窄。"),
    ("north", "北原", "player", 490, 155, 2, "适宜集结兵力的高原。"),
    ("northeast", "苍原", "rival", 760, 155, 1, "东境军的北方据点。"),
    ("west", "西关", "player", 215, 305, 1, "通向西部山口的要塞。"),
    ("capital", "王都", "player", 490, 305, 3, "商路与政令汇聚于此。"),
    ("east", "东港", "rival", 760, 305, 2, "东境军控制的贸易港。"),
    ("forest", "林地", "player", 215, 450, 1, "密林与低丘构成天然屏障。"),
    ("south", "南关", "rival", 490, 450, 1, "南方贸易通道的战略咽喉。"),
    ("bay", "海湾", "rival", 760, 450, 2, "舰队避风的天然港湾。"),
]
IDS = [row[0] for row in BOARD]
NEIGHBORS = {
    city_id: tuple(
        IDS[j] for j in (i - 3, i + 3, i - 1, i + 1)
        if 0 <= j < len(IDS) and (abs(j - i) == 3 or j // 3 == i // 3)
    ) for i, city_id in enumerate(IDS)
}
HEADQUARTERS: dict[CountryId, str] = {"player": "capital", "rival": "east"}
