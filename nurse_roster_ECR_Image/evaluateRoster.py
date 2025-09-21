# evaluateRoster.py — Strict validation + reward scoring for generated rosters
import json
import numpy as np
from collections import defaultdict

# ---- Default local file paths (only used if run as __main__) ----
roster_path = "generated/roster_21092025.json"
nurses_path = "data/nurse.json"
rules_path = "data/rules.json"
demand_path = "data/demand.json"
shift_path = "data/shift.json"


# ---- Helper: absolute shift times ----
def _shift_abs_times(day_str, shift_name, shift_def, day_index):
    start_s, end_s = shift_def["SHIFT_TIMES"][shift_name]

    def to_min(t):
        h, m = map(int, t.split(":"))
        return h * 60 + m

    start = to_min(start_s)
    end = to_min(end_s)
    if end <= start:  # crosses midnight
        end += 24 * 60

    day_idx = day_index[day_str]
    return day_idx * 24 * 60 + start, day_idx * 24 * 60 + end


# ---- Validation functions ----
def validate_demand(roster, demand):
    results = []
    for dept in roster["departments"]:
        dname = dept["name"]
        for day in demand[dname]:
            for shift in demand[dname][day]:
                assigned = sum(
                    1
                    for n in dept["nurses"]
                    for s in n["shifts"]
                    if s["day"] == day and s["shift"] == shift
                )
                bounds = demand[dname][day][shift]
                if assigned < bounds["min"] or assigned > bounds["max"]:
                    results.append(
                        f"❌ Demand violated in {dname} {day} {shift} "
                        f"(assigned={assigned}, allowed={bounds})"
                    )
    return results


def validate_hours_and_rest(roster, rules, shift_def, nurse_master, day_index):
    results = []
    DAILY_CAP = rules["constraints"]["daily_hours_cap"]
    WEEKLY_CAP = rules["constraints"]["weekly_hours_cap"]
    REST_HOURS = rules["constraints"]["rest_time_hours"]

    nurse_assigns = defaultdict(list)
    for dept in roster["departments"]:
        for n in dept["nurses"]:
            nid = n["id"]
            for s in n["shifts"]:
                sh = s["shift"]
                day = s["day"]
                start_abs, end_abs = _shift_abs_times(day, sh, shift_def, day_index)
                hours = shift_def["SHIFT_HOURS"][sh]
                nurse_assigns[nid].append(
                    {
                        "day": day,
                        "shift": sh,
                        "start_abs": start_abs,
                        "end_abs": end_abs,
                        "hours": hours,
                    }
                )

    for nid, assigns in nurse_assigns.items():
        total_week = sum(a["hours"] for a in assigns)
        if total_week > WEEKLY_CAP:
            results.append(
                f"❌ Nurse {nid} exceeds weekly cap: {total_week}h > {WEEKLY_CAP}h"
            )

        daily_sum = defaultdict(int)
        for a in assigns:
            daily_sum[a["day"]] += a["hours"]
        for day, h in daily_sum.items():
            if h > DAILY_CAP:
                results.append(
                    f"❌ Nurse {nid} exceeds daily cap on {day}: {h}h > {DAILY_CAP}h"
                )

        days_worked = {a["day"] for a in assigns}
        if len(days_worked) >= len(rules["general"]["days"]):
            results.append(f"❌ Nurse {nid} has no rest day (worked all days)")

        assigns_sorted = sorted(assigns, key=lambda x: x["start_abs"])
        for i in range(len(assigns_sorted) - 1):
            cur = assigns_sorted[i]
            nxt = assigns_sorted[i + 1]
            rest_minutes = nxt["start_abs"] - cur["end_abs"]
            if rest_minutes < 0:
                results.append(
                    f"❌ Nurse {nid} has overlapping shifts: "
                    f"{cur['day']} {cur['shift']} and {nxt['day']} {nxt['shift']}"
                )
            elif rest_minutes < REST_HOURS * 60:
                results.append(
                    f"❌ Nurse {nid} rest violation: only {rest_minutes} min between "
                    f"{cur['day']} {cur['shift']} → {nxt['day']} {nxt['shift']}; "
                    f"requires {REST_HOURS*60} min"
                )

    return results


def validate_core_skill(roster, rules, nurse_master, shift_def):
    results = []
    core_skills = rules["general"]["core_skill"]
    for dept in roster["departments"]:
        dept_name = dept["name"]
        for day in rules["general"]["days"]:
            for shift_type in shift_def["SHIFT_HOURS"].keys():
                assigned = [
                    n["id"]
                    for n in dept["nurses"]
                    for s in n["shifts"]
                    if s["day"] == day and s["shift"] == shift_type
                ]
                if not assigned:
                    continue
                has_core = any(
                    core_skills[dept_name]
                    in nurse_master.get(nid, {}).get("skills", [])
                    for nid in assigned
                )
                if not has_core:
                    results.append(
                        f"❌ {dept_name} {day} {shift_type} missing core skill nurse "
                        f"(assigned={assigned})"
                    )
    return results


# ---- Main evaluation function ----
def evaluate_roster(roster, nurses, rules, demand, shift_def):
    nurse_master = {n["nurse_id"]: n for n in nurses}
    day_index = {d: i for i, d in enumerate(rules["general"]["days"])}

    errors = []
    errors += validate_demand(roster, demand)
    errors += validate_hours_and_rest(roster, rules, shift_def, nurse_master, day_index)
    errors += validate_core_skill(roster, rules, nurse_master, shift_def)

    # Reward terms
    total_shifts = sum(
        len(demand[d][day])
        for d in rules["general"]["departments"]
        for day in rules["general"]["days"]
    )
    demand_satisfied = total_shifts - len([e for e in errors if "Demand violated" in e])

    fairness_penalty = 0.0
    hours_per_nurse = {}
    for dept in roster["departments"]:
        for nurse in dept["nurses"]:
            nid = nurse["id"]
            hours_per_nurse[nid] = sum(
                shift_def["SHIFT_HOURS"][s["shift"]] for s in nurse["shifts"]
            )
    if hours_per_nurse:
        fairness_penalty = np.var(list(hours_per_nurse.values()))

    demand_score = demand_satisfied / total_shifts
    compliance_violations = len(errors)
    preference_score = 0.0

    reward = (
        5.0 * demand_score
        - 10.0 * compliance_violations
        - 0.1 * fairness_penalty
        + 2.0 * preference_score
    )

    return {
        "reward": float(reward),
        "breakdown": {
            "demand_score": float(demand_score),
            "compliance_violations": int(compliance_violations),
            "fairness_penalty": float(fairness_penalty),
            "preference_score": float(preference_score),
        },
        "violations": errors,
    }


# ---- CLI Entrypoint ----
if __name__ == "__main__":
    with open(roster_path) as f:
        roster = json.load(f)
    with open(nurses_path) as f:
        nurse_list = json.load(f)
    with open(rules_path) as f:
        rules = json.load(f)
    with open(demand_path) as f:
        demand = json.load(f)
    with open(shift_path) as f:
        shift_def = json.load(f)

    print("✅ Loaded roster, nurses, rules, demand, and shifts")

    result = evaluate_roster(roster, nurse_list, rules, demand, shift_def)

    print("\n=== Evaluation Report ===")
    print("Reward:", result["reward"])
    print("Breakdown:", result["breakdown"])

    if not result["violations"]:
        print("✅ All constraints satisfied")
    else:
        print("⚠️ Violations found:")
        for e in result["violations"]:
            print(" -", e)
