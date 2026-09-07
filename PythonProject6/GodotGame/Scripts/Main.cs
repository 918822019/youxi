using Godot;

public partial class Main : Control
{
    private GameController _gameController;

    public override void _Ready()
    {
        _gameController = GetNode<GameController>("GameController");

        GetNode<Button>("VBoxContainer/Controls/StartButton").Pressed += OnStart;
        GetNode<Button>("VBoxContainer/Controls/NextTurnButton").Pressed += OnNextTurn;
        GetNode<CheckBox>("VBoxContainer/Controls/AutoPlayCheck").Toggled += OnAutoPlay;

        _gameController.GameStarted += () => Log("游戏开始!");
        _gameController.TurnCompleted += OnTurnCompleted;
        _gameState.GameEvent += Log;

        GetNode<Button>("VBoxContainer/Controls/NextTurnButton").Disabled = true;
        RefreshList();
    }

    private GameState _gameState => _gameController.GetNode<GameState>("GameState");

    private void OnStart()
    {
        _gameController.StartGame();
        GetNode<Button>("VBoxContainer/Controls/StartButton").Disabled = true;
        GetNode<Button>("VBoxContainer/Controls/NextTurnButton").Disabled = false;
        RefreshList();
    }

    private void OnNextTurn()
    {
        _gameController.NextTurn();
    }

    private void OnAutoPlay(bool pressed)
    {
        // Auto play logic
    }

    private void OnTurnCompleted(int turn, Godot.Collections.Array decisions)
    {
        GetNode<Label>("VBoxContainer/Header/TurnLabel").Text = $"回合: {turn}";

        var log = GetNode<RichTextLabel>("VBoxContainer/DecisionLog");
        log.Clear();
        log.AppendText($"[b]回合 {turn} 决策:[/b]\n");

        foreach (Godot.Collections.Dictionary d in decisions)
        {
            var country = _gameState.Countries[d["country"].ToString()];
            log.AppendText($"{country.Name}: {d["action"]} ({d["reason"]})\n");
        }
        RefreshList();
    }

    private void Log(string msg)
    {
        GetNode<RichTextLabel>("VBoxContainer/Content/EventLog").AppendText(msg + "\n");
    }

    private void RefreshList()
    {
        var list = GetNode<ItemList>("VBoxContainer/Content/CountryList");
        list.Clear();
        foreach (var country in _gameState.Countries.Values)
        {
            list.AddItem(country.GetSummary());
        }
    }
}
