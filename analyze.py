# -*- coding: utf-8 -*-
"""Titanic dataset analysis -> insights + analysis.json for the dashboard."""
import json
import pandas as pd

pd.set_option("display.width", 200)
df = pd.read_csv("titanic.csv")

# ---------- 1. 기본 정보 / 결측치 ----------
print("=" * 70)
print("1. 기본 정보")
print("=" * 70)
print("shape:", df.shape)
print("\n결측치:")
print(df.isna().sum()[lambda s: s > 0])
print("\n기술통계:")
print(df[["Survived", "Pclass", "Age", "SibSp", "Parch", "Fare"]].describe().round(2))

# ---------- 2. 전처리 ----------
d = df.copy()
d["Age"] = d.groupby(["Pclass", "Sex"])["Age"].transform(lambda s: s.fillna(s.median()))
d["Embarked"] = d["Embarked"].fillna(d["Embarked"].mode()[0])
d["FamilySize"] = d["SibSp"] + d["Parch"] + 1
d["Alone"] = (d["FamilySize"] == 1)
d["Title"] = (d["Name"].str.extract(r",\s*([^\.]+)\.", expand=False).str.strip()
              .replace({"Mlle": "Miss", "Ms": "Miss", "Mme": "Mrs", "Lady": "Noble",
                        "Sir": "Noble", "the Countess": "Noble", "Jonkheer": "Noble",
                        "Don": "Noble", "Dona": "Noble", "Capt": "Officer",
                        "Col": "Officer", "Major": "Officer", "Dr": "Officer",
                        "Rev": "Officer"}))
d["AgeGroup"] = pd.cut(d["Age"], [0, 12, 18, 30, 45, 60, 100],
                       labels=["0-12(아동)", "13-18(청소년)", "19-30", "31-45", "46-60", "60+"])
d["FareBand"] = pd.qcut(d["Fare"], 4, labels=["저(Q1)", "중저(Q2)", "중고(Q3)", "고(Q4)"])
d["HasCabin"] = d["Cabin"].notna()
d["Deck"] = d["Cabin"].str[0]

n = len(d)
overall = d["Survived"].mean()
print("\n" + "=" * 70)
print(f"2. 전체 생존율: {overall*100:.1f}%  ({int(d.Survived.sum())}/{n})")
print("=" * 70)

def rate(by):
    g = d.groupby(by, observed=True)["Survived"].agg(n="size", surv="sum", rate="mean")
    g["rate"] = (g["rate"] * 100).round(1)
    return g

for col in ["Sex", "Pclass", "Embarked", "AgeGroup", "FareBand", "Alone", "Title", "HasCabin"]:
    print(f"\n--- {col} ---")
    print(rate(col))

print("\n--- 성별 x 등급 교차 생존율(%) ---")
cross = (d.pivot_table(index="Sex", columns="Pclass", values="Survived", aggfunc="mean") * 100).round(1)
print(cross)
print("\n--- 가족규모별 ---")
print(rate("FamilySize"))
print("\n--- 상관계수 (Survived) ---")
corr = d[["Survived", "Pclass", "Age", "SibSp", "Parch", "Fare", "FamilySize"]].corr()["Survived"].round(3)
print(corr.sort_values())

# ---------- 3. 대시보드용 JSON ----------
def block(col, order=None):
    g = rate(col)
    if order:
        g = g.reindex([o for o in order if o in g.index])
    return {"labels": [str(i) for i in g.index],
            "n": [int(x) for x in g["n"]],
            "survived": [int(x) for x in g["surv"]],
            "rate": [float(x) for x in g["rate"]]}

# 연령 히스토그램 (생존/사망)
bins = list(range(0, 85, 5))
ages = df["Age"].dropna()
hist_s = pd.cut(df.loc[(df.Survived == 1) & df.Age.notna(), "Age"], bins).value_counts().sort_index()
hist_d = pd.cut(df.loc[(df.Survived == 0) & df.Age.notna(), "Age"], bins).value_counts().sort_index()

out = {
    "meta": {
        "rows": n,
        "cols": int(df.shape[1]),
        "source": "datasciencedojo/datasets - titanic.csv (Kaggle train set)",
        "overall_rate": round(overall * 100, 1),
        "survived": int(d.Survived.sum()),
        "died": int(n - d.Survived.sum()),
        "missing": {k: int(v) for k, v in df.isna().sum().items() if v > 0},
        "avg_age": round(float(ages.mean()), 1),
        "avg_fare": round(float(df.Fare.mean()), 2),
    },
    "sex": block("Sex"),
    "pclass": block("Pclass"),
    "embarked": block("Embarked"),
    "agegroup": block("AgeGroup"),
    "fareband": block("FareBand"),
    "alone": block("Alone"),
    "title": block("Title"),
    "hascabin": block("HasCabin"),
    "family": block("FamilySize"),
    "deck": block("Deck"),
    "cross": {
        "classes": [1, 2, 3],
        "female": [float(x) for x in cross.loc["female"].round(1)],
        "male": [float(x) for x in cross.loc["male"].round(1)],
    },
    "age_hist": {
        "labels": [f"{b}-{b+4}" for b in bins[:-1]],
        "survived": [int(x) for x in hist_s],
        "died": [int(x) for x in hist_d],
    },
    "fare_scatter": [
        {"x": round(float(r.Age), 1), "y": round(float(r.Fare), 2), "s": int(r.Survived), "c": int(r.Pclass)}
        for r in d.itertuples() if r.Fare < 300
    ],
    "corr": {"labels": [str(i) for i in corr.index if i != "Survived"],
             "values": [float(corr[i]) for i in corr.index if i != "Survived"]},
    "class_fare": {
        "labels": ["1등급", "2등급", "3등급"],
        "avg_fare": [round(float(x), 2) for x in d.groupby("Pclass")["Fare"].mean()],
        "avg_age": [round(float(x), 1) for x in d.groupby("Pclass")["Age"].mean()],
    },
}
with open("analysis.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("\n>>> analysis.json 저장 완료")
