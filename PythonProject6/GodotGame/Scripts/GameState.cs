using Godot;
using System;
using System.Collections.Generic;
using System.Text.Json;

public partial class GameState : Node
{
    public Dictionary<string, Country> Countries = new();
    public int Turn = 0;
    public bool IsRunning = false;

    [Signal]
    public delegate void GameEventEventHandler(string message);

    public override void _Ready()
    {
        LoadWorld();
    }

    private void LoadWorld()
    {
        var file = FileAccess.Open("res://Data/world.json", FileAccess.ModeFlags.Read);
        if (file == null)
        {
            EmitSignal(SignalName.GameEvent, "无法加载世界数据");
            return;
        }

        var json = JsonSerializer.Deserialize<Dictionary<string, object>>(file.GetAsText());
        if (json == null || !json.ContainsKey("countries")) return;

        var countries = JsonSerializer.Deserialize<List<Dictionary<string, object>>>(json["countries"].ToString());
        foreach (var data in countries)
        {
            var country = new Country(data["id"].ToString(), data["name"].ToString());
            country.Gold = Convert.ToInt32(data["gold"]);
            country.Food = Convert.ToInt32(data["food"]);
            country.Military = Convert.ToInt32(data["military"]);
            country.Population = Convert.ToInt32(data["population"]);
            country.Technology = Convert.ToInt32(data["technology"]);
            Countries[country.Id] = country;
        }
        EmitSignal(SignalName.GameEvent, $"世界加载完成: {Countries.Count}个国家");
    }

    public void StartGame()
    {
        IsRunning = true;
        Turn = 0;
        EmitSignal(SignalName.GameEvent, "游戏开始!");
    }

    public bool AdvanceTurn()
    {
        if (!IsRunning) return false;
        Turn++;
        foreach (var country in Countries.Values)
        {
            ProcessCountryTurn(country);
        }
        return true;
    }

    private void ProcessCountryTurn(Country country)
    {
        country.Gold += (int)(country.Population * 0.01);
        country.Food += (int)(country.Population * 0.005);
        country.Food -= (int)(country.Military * 0.1);
        country.Gold -= (int)(country.Military * 0.05);
        if (country.Food < 0) { country.Stability -= 0.1f; country.Food = 0; }
        if (country.Gold < 0) { country.Stability -= 0.05f; country.Gold = 0; }
        country.Stability = Mathf.Clamp(country.Stability, 0f, 1f);
        country.Happiness = Mathf.Clamp(0.5f + country.Stability * 0.3f - (float)country.Military / country.Population * 0.2f, 0f, 1f);
    }

    public Dictionary<string, object> GetContext(string countryId)
    {
        var country = Countries[countryId];
        var others = new List<Dictionary<string, object>>();
        foreach (var other in Countries.Values)
        {
            if (other.Id != countryId)
            {
                others.Add(new Dictionary<string, object>
                {
                    ["name"] = other.Name,
                    ["relation"] = country.Relations.GetValueOrDefault(other.Id, 0f),
                    ["military"] = other.Military,
                    ["technology"] = other.Technology
                });
            }
        }
        return new Dictionary<string, object>
        {
            ["country"] = country.ToDict(),
            ["turn"] = Turn,
            ["others"] = others
        };
    }
}
