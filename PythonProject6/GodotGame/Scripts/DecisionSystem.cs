using Godot;
using System;
using System.Collections.Generic;

public partial class DecisionSystem : Node
{
    private GameState _gameState;
    private LLMProvider _llm;
    private bool _useLLM = false;

    public DecisionSystem(GameState state, bool useLLM = false)
    {
        _gameState = state;
        _useLLM = useLLM;
    }

    public void SetLLM(LLMProvider provider)
    {
        _llm = provider;
        _useLLM = true;
    }

    public async void MakeDecision(string countryId, Action<Dictionary<string, string>> callback)
    {
        var country = _gameState.Countries[countryId];

        if (_useLLM && _llm != null)
        {
            var context = _gameState.GetContext(countryId);
            var prompt = _llm.BuildPrompt(context);
            var response = await _llm.Generate(prompt);
            if (!string.IsNullOrEmpty(response))
            {
                callback(ParseResponse(response));
                return;
            }
        }

        callback(RuleBasedDecision(country));
    }

    private Dictionary<string, string> RuleBasedDecision(Country country)
    {
        string action, reason;
        if (country.Gold < 200) { action = "发展经济"; reason = "资金不足"; }
        else if (country.Food < 100) { action = "发展农业"; reason = "粮食短缺"; }
        else if (country.Military < 50) { action = "扩充军备"; reason = "军力薄弱"; }
        else if (country.Stability < 0.5f) { action = "改善民生"; reason = "稳定度低"; }
        else { action = "科技研发"; reason = "均衡发展"; }

        return new Dictionary<string, string> { ["action"] = action, ["reason"] = reason };
    }

    private Dictionary<string, string> ParseResponse(string response)
    {
        string[] actions = { "发展经济", "扩充军备", "科技研发", "改善民生", "战争准备" };
        foreach (var action in actions)
        {
            if (response.Contains(action))
                return new Dictionary<string, string> { ["action"] = action, ["reason"] = "LLM决策" };
        }
        return new Dictionary<string, string> { ["action"] = "和平发展", ["reason"] = "默认" };
    }

    public void ApplyDecision(Country country, Dictionary<string, string> decision)
    {
        switch (decision["action"])
        {
            case "发展经济": country.Gold += 200; country.Stability += 0.05f; break;
            case "扩充军备": country.Military += 50; country.Gold -= 100; break;
            case "科技研发": country.Technology += 1; country.Gold -= 150; break;
            case "改善民生": country.Happiness += 0.1f; country.Stability += 0.1f; break;
            case "战争准备": country.Military += 100; country.Gold -= 200; break;
            case "和平发展": country.Gold += 100; break;
        }
    }
}
