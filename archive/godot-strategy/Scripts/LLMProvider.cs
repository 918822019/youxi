using Godot;
using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

public partial class LLMProvider : Node
{
    public virtual Task<string> Generate(string prompt)
    {
        return Task.FromResult("");
    }

    public string BuildPrompt(Dictionary<string, object> context)
    {
        var country = (Dictionary<string, object>)context["country"];
        return $"你是{country["name"]}的AI顾问。金{country["gold"]} 粮{country["food"]} 兵{country["military"]}\n请选择：发展经济/扩充军备/科技研发/改善民生/战争准备";
    }
}

public partial class OllamaProvider : LLMProvider
{
    private string _url;
    private string _model;

    public OllamaProvider(string url = "http://localhost:11434", string model = "llama3")
    {
        _url = url;
        _model = model;
    }

    public override async Task<string> Generate(string prompt)
    {
        try
        {
            var body = JsonSerializer.Serialize(new { model = _model, prompt = prompt, stream = false });
            var http = new HttpRequest();
            AddChild(http);
            http.Request($"{_url}/api/generate", new[] { "Content-Type: application/json" }, HttpClient.Method.Post, body);

            var result = await ToSignal(http, "request_completed");
            var responseCode = (long)result[1];
            var responseBody = (byte[])result[3];

            if (responseCode != 200) return "";
            var json = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(System.Text.Encoding.UTF8.GetString(responseBody));
            return json["response"].GetString();
        }
        catch { return ""; }
    }
}

public partial class ApiProvider : LLMProvider
{
    private string _url;
    private string _key;
    private string _model;

    public ApiProvider(string url, string key, string model = "gpt-3.5-turbo")
    {
        _url = url;
        _key = key;
        _model = model;
    }

    public override async Task<string> Generate(string prompt)
    {
        try
        {
            var body = JsonSerializer.Serialize(new
            {
                model = _model,
                messages = new[] { new { role = "user", content = prompt } },
                max_tokens = 500
            });
            var http = new HttpRequest();
            AddChild(http);
            http.Request(_url, new[] { "Content-Type: application/json", $"Authorization: Bearer {_key}" }, HttpClient.Method.Post, body);

            var result = await ToSignal(http, "request_completed");
            var responseCode = (long)result[1];
            var responseBody = (byte[])result[3];

            if (responseCode != 200) return "";
            var json = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(System.Text.Encoding.UTF8.GetString(responseBody));
            var choices = json["choices"][0].GetProperty("message").GetProperty("content").GetString();
            return choices;
        }
        catch { return ""; }
    }
}
