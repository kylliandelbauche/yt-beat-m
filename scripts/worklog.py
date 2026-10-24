"""Record issue elapsed time and observed Codex counters; never estimate billing."""

import argparse
import json
import os
import subprocess
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".local" / "worklogs"
REPO = "kylliandelbauche/yt-beat-m"
KEYS = (
    "input_tokens",
    "cached_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
    "total_tokens",
)


def snapshot():
    thread = os.environ.get("CODEX_THREAD_ID")
    codex_root = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
    files = list((codex_root / "sessions").rglob(f"*{thread}.jsonl")) if thread else []
    latest = None
    for file in files:
        with file.open(encoding="utf-8") as stream:
            for line in stream:
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue  # A live log may end in an incomplete line.
                payload = event.get("payload", {})
                if event.get("type") == "event_msg" and payload.get("type") == "token_count":
                    usage = (payload.get("info") or {}).get("total_token_usage")
                    if usage and (latest is None or event["timestamp"] > latest["sampled_at"]):
                        latest = {
                            "sampled_at": event["timestamp"],
                            "counters": {key: usage.get(key) for key in KEYS},
                        }
    return {"at": datetime.now(UTC).isoformat(), "thread": thread, "telemetry": latest}


def comment(issue, report):
    marker = f"<!-- yt-beat-m-worklog:{issue} -->"
    start, end = report["start"], report["end"]
    delta = report["tokens"]
    lines = [
        marker,
        "## Suivi du travail",
        "",
        f"- Début UTC : {start['at']}",
        f"- Fin UTC : {end['at']}",
        f"- Temps écoulé : {report['elapsed_seconds'] / 60:.1f} minutes "
        "(outils et attente de CI inclus).",
    ]
    if delta:
        lines.extend(
            [
                f"- Tokens observés : **{delta['total_tokens']:,}**.",
                f"- Entrée : {delta['input_tokens']:,}, "
                f"dont cache : {delta['cached_input_tokens']:,}.",
                f"- Sortie : {delta['output_tokens']:,}, "
                f"dont raisonnement : {delta['reasoning_output_tokens']:,}.",
                f"- Bornes des compteurs UTC : {start['telemetry']['sampled_at']} "
                f"→ {end['telemetry']['sampled_at']}.",
            ]
        )
    else:
        lines.append(
            "- Tokens : **non disponible** (télémétrie absente, incomplète, "
            "réinitialisée ou conversation différente)."
        )
    lines += [
        "",
        "Mesure : différence des compteurs cumulés de la même conversation entre les deux "
        "derniers relevés disponibles aux bornes. Les appels après le dernier relevé, dont "
        "la publication de ce commentaire, sont exclus. Les tokens en cache et de raisonnement "
        "sont des sous-ensembles, pas des suppléments. Cette mesure ne représente ni une facture "
        "ni une part exacte du quota partagé.",
        "",
        report.get("note", ""),
    ]
    body = "\n".join(lines)
    comments = json.loads(
        subprocess.check_output(
            ["gh", "api", f"repos/{REPO}/issues/{issue}/comments", "--paginate"], text=True
        )
    )
    existing = next((item for item in comments if marker in item.get("body", "")), None)
    endpoint = (
        f"repos/{REPO}/issues/comments/{existing['id']}"
        if existing
        else f"repos/{REPO}/issues/{issue}/comments"
    )
    subprocess.run(
        [
            "gh",
            "api",
            endpoint,
            "--method",
            "PATCH" if existing else "POST",
            "--input",
            "-",
            "--silent",
        ],
        input=json.dumps({"body": body}),
        text=True,
        check=True,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["start", "finish"])
    parser.add_argument("issue", type=int)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--note", default="")
    args = parser.parse_args()
    STATE.mkdir(parents=True, exist_ok=True)
    path = STATE / f"issue-{args.issue}.json"
    if args.action == "start":
        if path.exists():
            parser.error(
                "Un relevé existe déjà pour cette issue ; ne pas écraser sa borne de départ."
            )
        report = {"issue": args.issue, "start": snapshot()}
    else:
        if not path.exists():
            parser.error("Borne de départ absente ; ne pas inventer de durée.")
        report = json.loads(path.read_text(encoding="utf-8"))
        end = snapshot()
        start = report["start"]
        report.update(
            end=end,
            elapsed_seconds=round(
                (
                    datetime.fromisoformat(end["at"]) - datetime.fromisoformat(start["at"])
                ).total_seconds()
            ),
            note=args.note,
        )
        a, b = start["telemetry"], end["telemetry"]
        delta = (
            {key: b["counters"][key] - a["counters"][key] for key in KEYS}
            if a
            and b
            and start["thread"] == end["thread"]
            and all(isinstance(x["counters"][key], int) for x in (a, b) for key in KEYS)
            else None
        )
        report["tokens"] = (
            delta
            if delta
            and all(value >= 0 for value in delta.values())
            and delta["total_tokens"] == delta["input_tokens"] + delta["output_tokens"]
            else None
        )
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.publish:
        if args.action != "finish":
            parser.error("--publish demande finish")
        comment(args.issue, report)
    print(
        json.dumps(
            {key: value for key, value in report.items() if key not in ("start", "end")},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
