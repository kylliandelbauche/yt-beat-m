"""Move an issue on the project's kanban using authenticated gh."""

import argparse
import json
import subprocess
from pathlib import Path


def gh(*args):
    return json.loads(subprocess.check_output(["gh", *args], text=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("issue", type=int)
    parser.add_argument("status", choices=["Open", "In progress", "In review", "Done", "Closed"])
    args = parser.parse_args()
    project = json.loads(
        (Path(__file__).resolve().parents[1] / ".github/project.json").read_text(encoding="utf-8")
    )
    fields = gh(
        "project",
        "field-list",
        str(project["number"]),
        "--owner",
        project["owner"],
        "--format",
        "json",
    )
    status = next(field for field in fields["fields"] if field["name"] == "Status")
    option = next(option for option in status["options"] if option["name"] == args.status)
    item = gh(
        "project",
        "item-add",
        str(project["number"]),
        "--owner",
        project["owner"],
        "--url",
        f"https://github.com/{project['owner']}/yt-beat-m/issues/{args.issue}",
        "--format",
        "json",
    )
    subprocess.run(
        [
            "gh",
            "project",
            "item-edit",
            "--id",
            item["id"],
            "--project-id",
            project["id"],
            "--field-id",
            status["id"],
            "--single-select-option-id",
            option["id"],
        ],
        check=True,
    )
    print(f"#{args.issue} → {args.status}")


if __name__ == "__main__":
    main()
