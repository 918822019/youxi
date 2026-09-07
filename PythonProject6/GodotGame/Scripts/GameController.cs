using Godot;
using System.Collections.Generic;

public partial class GameController : Node
{
    private GameState _gameState;
    private DecisionSystem _decisionSystem;
    public bool IsRunning = false;

    [Signal]
    public delegate void GameStartedEventHandler();
    [Signal]
    public delegate void TurnCompletedEventHandler(int turn, Godot.Collections.Array decisions);
    [Signal]
    public delegate void GameEndedEventHandler();

    public override void _Ready()
    {
        _gameState = GetNode<GameState>("GameState");
        _decisionSystem = new DecisionSystem(_gameState);
        AddChild(_decisionSystem);
    }

    public void StartGame()
    {
        _gameState.StartGame();
        IsRunning = true;
        EmitSignal(SignalName.GameStarted);
    }

    public void NextTurn()
    {
        if (!IsRunning) return;

        var decisions = new Godot.Collections.Array();
        foreach (var countryId in _gameState.Countries.Keys)
        {
            _decisionSystem.MakeDecision(countryId, (decision) =>
            {
                var country = _gameState.Countries[countryId];
                _decisionSystem.ApplyDecision(country, decision);
                var d = new Godot.Collections.Dictionary { ["country"] = countryId, ["action"] = decision["action"], ["reason"] = decision["reason"] };
                decisions.Add(d);
            });
        }

        _gameState.AdvanceTurn();
        EmitSignal(SignalName.TurnCompleted, _gameState.Turn, decisions);
    }

    public void SetUseLLM(bool enabled)
    {
        // Will be connected to LLM provider
    }

    public void ConfigureLocalLLM(string url, string model)
    {
        var provider = new OllamaProvider(url, model);
        AddChild(provider);
        _decisionSystem.SetLLM(provider);
    }

    public void ConfigureApiLLM(string url, string key, string model)
    {
        var provider = new ApiProvider(url, key, model);
        AddChild(provider);
        _decisionSystem.SetLLM(provider);
    }
}
