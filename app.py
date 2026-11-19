"""Local web UI for the triage agent.

Run: export ANTHROPIC_API_KEY=... && python app.py, then open http://127.0.0.1:5000.
"""

from flask import Flask, jsonify, render_template, request

from src import baseline
from src.agent import classify
from src.knowledge_base import get_provision

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/classify")
def classify_route():
    description = ((request.get_json(silent=True) or {}).get("description") or "").strip()
    if not description:
        return jsonify({"error": "Please describe the product first."}), 400
    try:
        result = classify(description)
    except Exception:
        app.logger.exception("Agent call failed")
        return jsonify({"error": "The assessment could not be completed. Check the server log and try again."}), 502
    result.pop("messages", None)
    result["citation_details"] = [
        {"id": c, "title": (get_provision(c) or {}).get("title")} for c in result["citations"]
    ]
    result["baseline_tier"] = baseline.classify(description)["tier"]
    return jsonify(result)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False, load_dotenv=False)
