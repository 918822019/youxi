using Godot;
using System.Collections.Generic;

public partial class Country
{
    public string Id;
    public string Name;
    public int Gold = 1000;
    public int Food = 500;
    public int Military = 100;
    public int Population = 10000;
    public int Technology = 1;
    public float Stability = 0.7f;
    public float Happiness = 0.6f;
    public Dictionary<string, float> Relations = new();

    public Country(string id, string name)
    {
        Id = id;
        Name = name;
    }

    public string GetSummary()
    {
        return $"{Name} | 金:{Gold} 粮:{Food} 兵:{Military} 人:{Population} 科:{Technology} 稳:{Stability:F1}";
    }

    public Dictionary<string, object> ToDict()
    {
        return new Dictionary<string, object>
        {
            ["id"] = Id, ["name"] = Name,
            ["gold"] = Gold, ["food"] = Food, ["military"] = Military,
            ["population"] = Population, ["technology"] = Technology,
            ["stability"] = Stability, ["happiness"] = Happiness
        };
    }
}
