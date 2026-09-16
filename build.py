# -*- coding: utf-8 -*-
"""Assemble the standalone single-file dashboard."""
import io, json

data = json.load(open("analysis.json", encoding="utf-8"))
data.pop("fare_scatter", None)                      # not charted
lib = io.open("chart.umd.min.js", encoding="utf-8").read()
assert "</script" not in lib.lower()                # safe to inline verbatim

html = io.open("template.html", encoding="utf-8").read()
assert "/*__CHARTJS__*/" in html and "/*__DATA__*/" in html
html = html.replace("/*__CHARTJS__*/", lib)
html = html.replace("/*__DATA__*/", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
io.open("dashboard.html", "w", encoding="utf-8").write(html)
print("dashboard.html:", round(len(html.encode("utf-8")) / 1024, 1), "KB (Chart.js inlined, no network needed)")
