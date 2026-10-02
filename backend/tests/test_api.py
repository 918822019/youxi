import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.api import main
from backend.core.game import Game


class CampaignApiTests(unittest.TestCase):
    def test_save_load_and_reset_roundtrip(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(main, "SAVE_FILE", Path(folder) / "campaign.json"):
            main.game = Game()
            with TestClient(main.app) as client:
                self.assertEqual(client.post("/api/load").status_code, 404)
                preview = client.get("/api/route-preview", params={"unitId": "second", "targetId": "north"})
                self.assertEqual(preview.status_code, 200)
                self.assertEqual(preview.json()["route"], ["capital", "north"])
                self.assertIsNone(client.get("/api/view").json()["units"][1]["order"])
                accepted = client.post("/api/commands", json={"type": "set_production", "focus": "supplies"})
                self.assertTrue(accepted.json()["commandResults"][0]["accepted"])
                day = client.post("/api/day").json()
                self.assertEqual(day["turn"], 2)
                self.assertEqual(day["production"], "supplies")
                self.assertTrue(client.post("/api/save").json()["saved"])
                self.assertEqual(client.post("/api/reset").json()["turn"], 1)
                restored = client.post("/api/load").json()
                self.assertEqual(restored, day)
                (Path(folder) / "campaign.json").write_text('{"version":42}')
                self.assertEqual(client.post("/api/load").status_code, 400)
                self.assertEqual(client.get("/api/view").json(), day)
        main.game = Game()


if __name__ == "__main__":
    unittest.main()
