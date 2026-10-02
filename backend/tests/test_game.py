import unittest

from backend.core.game import Game
from backend.core.models import Command
from backend.core.world import NEIGHBORS


class CampaignTests(unittest.TestCase):
    def test_board_is_connected_and_visibility_hides_private_data(self):
        game = Game()
        view = game.view()
        self.assertEqual(len(view.cities), 9)
        self.assertEqual(len(NEIGHBORS), 9)
        self.assertEqual(view.country, "player")
        self.assertEqual(game.view("rival").cities[0].garrison, None)
        self.assertEqual(game.view("rival").cities[0].supplied, None)
        self.assertNotIn("plan", view.model_dump())

    def test_authority_and_shared_batch_resources(self):
        game = Game()
        results = game.submit("player", [
            Command(type="attack", unitId="east_army", targetId="capital"),
            Command(type="move", unitId="first", targetId="east"),
            Command(type="attack", unitId="second", targetId="west"),
        ]).commandResults
        self.assertFalse(any(result.accepted for result in results))
        self.assertEqual(game.view().gold, 100)
        results = game.submit("player", [Command(type="recruit", cityId="west") for _ in range(4)]).commandResults
        self.assertEqual([result.accepted for result in results], [True] * 3 + [False])
        self.assertEqual(game.view().gold, 40)
        self.assertEqual(game.view().equipment, 0)
        self.assertEqual(next(unit.strength for unit in game.view().units if unit.id == "second"), 50)

    def test_production_and_supply_are_authoritative(self):
        game = Game()
        response = game.submit("player", [Command(type="set_production", focus="supplies")])
        self.assertEqual(response.production, "supplies")
        next_day = game.advance_day()
        self.assertEqual(next_day.gold, 105)
        self.assertEqual(next_day.equipment, 30)
        self.assertEqual(next_day.supplies, 46)
        game._cities["north"].owner = "rival"
        game._cities["west"].owner = "rival"
        self.assertFalse(next(city for city in game.view().cities if city.id == "highlands").supplied)
        self.assertFalse(game.submit("player", [Command(type="recruit", cityId="highlands")]).commandResults[0].accepted)

    def test_recruit_creates_a_new_army_in_empty_supplied_province(self):
        game = Game()
        response = game.submit("player", [Command(type="recruit", cityId="forest")])
        self.assertTrue(response.commandResults[0].accepted)
        self.assertEqual(len(response.units), 7)
        reserve = next(unit for unit in response.units if unit.id == "player_reserve_1")
        self.assertEqual((reserve.cityId, reserve.strength), ("forest", 10))
        forbidden = game.submit("rival", [Command(type="recruit", cityId="forest")])
        self.assertFalse(forbidden.commandResults[0].accepted)

    def test_disconnected_army_cannot_attack_and_loses_strength(self):
        game = Game()
        game._cities["north"].owner = "rival"
        game._cities["west"].owner = "rival"
        game._units["third"].cityId = "highlands"
        command = game.submit("player", [Command(type="attack", unitId="third", targetId="north")])
        self.assertFalse(command.commandResults[0].accepted)
        before = game._units["third"].strength
        game.advance_day()
        self.assertEqual(game._units["third"].strength, before - 2)

    def test_ai_can_rebuild_when_armies_are_lost(self):
        game = Game()
        game._units = {id: unit for id, unit in game._units.items() if unit.owner == "player"}
        game.advance_day()
        self.assertTrue(any(unit.owner == "rival" for unit in game.view("rival").units))
        self.assertEqual(game.debug_ai()["commands"][0]["type"], "recruit")

    def test_ai_submits_legal_commands_and_maintains_orders(self):
        game = Game()
        first_day = game.advance_day()
        self.assertGreater(len(game.debug_ai()["commands"]), 1)
        self.assertTrue(all(result["accepted"] for result in game.debug_ai()["results"]))
        self.assertEqual(first_day.turn, 2)
        for _ in range(2):
            game.advance_day()
        self.assertTrue(any(unit.order == "attack" for unit in game.view("rival").units if unit.owner == "rival"))
        self.assertTrue(any(result["accepted"] for result in game.debug_ai()["results"]))

    def test_captured_defender_cannot_execute_pending_order(self):
        game = Game()
        game._units["first"].strength = 100
        game.submit("player", [Command(type="attack", unitId="first", targetId="east")])
        game._units["first"].daysRemaining = 1
        defender = game._units["east_army"]
        defender.order = "attack"
        defender.targetId = "capital"
        defender.daysRemaining = 1
        game.advance_day()
        self.assertEqual(game._cities["east"].owner, "player")
        self.assertEqual(game._cities["capital"].owner, "player")
        self.assertNotIn("east_army", game._units)

    def test_cancel_requires_own_active_order_but_allows_immediate_new_order(self):
        game = Game()
        self.assertFalse(game.submit("player", [Command(type="cancel_order", unitId="second")]).commandResults[0].accepted)
        game.submit("player", [Command(type="move", unitId="second", targetId="north")])
        game._resolve_orders()
        self.assertFalse(game.submit("rival", [Command(type="cancel_order", unitId="second")]).commandResults[0].accepted)
        cancelled = game.submit("player", [Command(type="cancel_order", unitId="second")])
        unit = next(unit for unit in cancelled.units if unit.id == "second")
        self.assertTrue(cancelled.commandResults[0].accepted)
        self.assertEqual((unit.order, unit.route, unit.daysRemaining), (None, [], 0))
        accepted = game.submit("player", [Command(type="move", unitId="second", targetId="capital")])
        self.assertTrue(accepted.commandResults[0].accepted)
        restored = Game.from_snapshot(game.snapshot())
        self.assertEqual(restored.view().units[1].route, ["capital"])

    def test_redirect_replans_from_current_province_with_one_day_penalty(self):
        game = Game()
        game.submit("player", [Command(type="move", unitId="second", targetId="north")])
        game._resolve_orders()
        self.assertFalse(game.submit("player", [Command(type="redirect", unitId="second", targetId="north")]).commandResults[0].accepted)
        changed = game.submit("player", [Command(type="redirect", unitId="second", targetId="forest")])
        unit = next(unit for unit in changed.units if unit.id == "second")
        self.assertTrue(changed.commandResults[0].accepted)
        self.assertEqual((unit.cityId, unit.route, unit.daysRemaining), ("west", ["forest"], 3))
        game._resolve_orders()
        self.assertEqual(game._units["second"].daysRemaining, 2)
        game._resolve_orders()
        game._resolve_orders()
        self.assertEqual(game._units["second"].cityId, "forest")
        self.assertIsNone(game._units["second"].order)

    def test_read_only_preview_matches_command_validation(self):
        game = Game()
        snapshot = game.snapshot()
        preview = game.preview_order("player", "second", "north")
        self.assertTrue(preview.valid)
        self.assertEqual((preview.action, preview.route, preview.eta), ("move", ["capital", "north"], 4))
        self.assertEqual(game.snapshot(), snapshot)
        self.assertFalse(game.preview_order("player", "east_army", "capital").valid)
        issued = game.submit("player", [Command(type="move", unitId="second", targetId="north")])
        self.assertEqual(preview.route, next(unit.route for unit in issued.units if unit.id == "second"))
        self.assertFalse(game.preview_order("player", "second", "north").valid)
        changed = game.preview_order("player", "second", "forest")
        self.assertTrue(changed.valid)
        self.assertEqual((changed.action, changed.eta), ("move", 3))

    def test_preview_explains_blocked_route_without_changing_world(self):
        game = Game()
        for city_id in ("capital", "highlands", "forest"):
            game._cities[city_id].owner = "rival"
        before = game.snapshot()
        preview = game.preview_order("player", "second", "north")
        self.assertFalse(preview.valid)
        self.assertEqual(preview.reason, "当前战线下目标不可达")
        self.assertEqual(before, game.snapshot())
        result = game.submit("player", [Command(type="move", unitId="second", targetId="north")])
        self.assertFalse(result.commandResults[0].accepted)
        self.assertEqual(result.commandResults[0].reason, preview.reason)

    def test_cross_province_move_and_replan_when_front_changes(self):
        game = Game()
        view = game.submit("player", [Command(type="move", unitId="second", targetId="north")])
        unit = next(unit for unit in view.units if unit.id == "second")
        self.assertEqual(unit.route, ["capital", "north"])
        game._cities["capital"].owner = "rival"
        game._resolve_orders()
        self.assertEqual(game._units["second"].route, ["highlands", "north"])
        self.assertEqual(game._units["second"].daysRemaining, 1)
        for _ in range(3):
            game._resolve_orders()
        self.assertEqual(game._units["second"].cityId, "north")
        self.assertIsNone(game._units["second"].order)

    def test_route_cancels_if_all_friendly_corridors_are_lost(self):
        game = Game()
        game.submit("player", [Command(type="move", unitId="second", targetId="north")])
        game._cities["capital"].owner = "rival"
        game._cities["highlands"].owner = "rival"
        game._resolve_orders()
        self.assertIsNone(game._units["second"].order)
        self.assertTrue(any("路线被切断" in report.text for report in game.view().reports))

    def test_offensive_order_captures_every_enemy_waypoint(self):
        game = Game()
        game._units["first"].strength = 100
        result = game.submit("player", [Command(type="attack", unitId="first", targetId="bay")])
        self.assertEqual(result.units[0].route, ["east", "bay"])
        game._resolve_orders()
        game._resolve_orders()
        self.assertEqual(game._cities["east"].owner, "player")
        self.assertEqual(game._units["first"].route, ["bay"])
        game._resolve_orders()
        game._resolve_orders()
        self.assertEqual(game._cities["bay"].owner, "player")
        self.assertEqual(game._units["first"].cityId, "bay")
        self.assertIsNone(game._units["first"].order)

    def test_old_save_without_routes_replans_on_next_day(self):
        game = Game()
        game.submit("player", [Command(type="move", unitId="second", targetId="north")])
        snapshot = game.snapshot()
        snapshot["version"] = 1
        for unit in snapshot["units"]:
            unit.pop("route")
        restored = Game.from_snapshot(snapshot)
        restored._resolve_orders()
        self.assertEqual(restored._units["second"].route, ["capital", "north"])
        self.assertEqual(restored._units["second"].daysRemaining, 1)

    def test_save_roundtrip_preserves_orders_economy_and_ai_plan(self):
        game = Game()
        game.submit("player", [Command(type="set_production", focus="supplies"), Command(type="attack", unitId="first", targetId="east")])
        game.advance_day()
        restored = Game.from_snapshot(game.snapshot())
        self.assertEqual(restored.view().model_dump(), game.view().model_dump())
        self.assertEqual(restored.debug_ai()["plan"], game.debug_ai()["plan"])
        self.assertEqual(restored.advance_day().turn, game.advance_day().turn)
        with self.assertRaises(ValueError):
            Game.from_snapshot({"version": 999})


if __name__ == "__main__":
    unittest.main()
