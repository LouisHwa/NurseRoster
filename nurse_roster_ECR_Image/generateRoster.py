import json
import pandas as pd
import xgboost as xgb
import tarfile
import tempfile
import numpy as np
from collections import defaultdict
from ortools.sat.python import cp_model
from datetime import datetime
import os
import boto3

s3 = boto3.client("s3")

# ---------------- S3 CONFIG ----------------
INPUT_BUCKET = os.environ.get("INPUT_S3_BUCKET", "hospital-roster-data")
OUTPUT_BUCKET = os.environ.get("OUTPUT_S3_BUCKET", "hospital-roster-data")
OUTPUT_PREFIX = os.environ.get("OUTPUT_PREFIX", "roster_history/")

# Local paths inside container
DATA_DIR = "data"

# S3 paths for input files
NURSES_KEY = os.environ.get("NURSE_PATH", "raw_data/nurse_data/nurse.json")
RULES_KEY = os.environ.get("RULES_PATH", "raw_data/rules.json")
DEMAND_KEY = os.environ.get("DEMAND_PATH", "raw_data/demand_data/demand.json")
SHIFT_KEY = os.environ.get("SHIFT_PATH", "raw_data/shift.json")
PAIRWISE_KEY = os.environ.get(
    "PAIRWISE_PATH", "training/pairwise_weekly_compliance.parquet"
)
MODEL_KEY = os.environ.get(
    "MODEL_PATH",
    "training/xgboost/output/sagemaker-xgboost-2025-09-20-01-07-22-211/output/model.tar.gz",
)


# ---------------- HELPERS ----------------
def download_from_s3(bucket, key, local_path):
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    print(f"⬇️ Downloading s3://{bucket}/{key} -> {local_path}")
    s3.download_file(bucket, key, local_path)


def upload_to_s3(local_path, bucket, key):
    print(f"⬆️ Uploading {local_path} -> s3://{bucket}/{key}")
    s3.upload_file(local_path, bucket, key)


def load_data():
    # Download all files from S3
    nurses_path = os.path.join(DATA_DIR, "nurse.json")
    rules_path = os.path.join(DATA_DIR, "rules.json")
    demand_path = os.path.join(DATA_DIR, "demand.json")
    shift_path = os.path.join(DATA_DIR, "shift.json")
    train_path = os.path.join(DATA_DIR, "pairwise_weekly_compliance.parquet")
    model_tar_path = os.path.join(DATA_DIR, "model.tar.gz")

    download_from_s3(INPUT_BUCKET, NURSES_KEY, nurses_path)
    download_from_s3(INPUT_BUCKET, RULES_KEY, rules_path)
    download_from_s3(INPUT_BUCKET, DEMAND_KEY, demand_path)
    download_from_s3(INPUT_BUCKET, SHIFT_KEY, shift_path)
    download_from_s3(INPUT_BUCKET, PAIRWISE_KEY, train_path)
    download_from_s3(INPUT_BUCKET, MODEL_KEY, model_tar_path)

    # Load JSON files
    with open(nurses_path) as f:
        nurse_list = json.load(f)
    with open(rules_path) as f:
        rules = json.load(f)
    with open(demand_path) as f:
        demand = json.load(f)
    with open(shift_path) as f:
        shift_def = json.load(f)

    # Extract XGBoost model
    with tempfile.TemporaryDirectory() as tmpdir:
        with tarfile.open(model_tar_path) as tar:
            tar.extractall(path=tmpdir)
        model_file = os.path.join(tmpdir, "xgboost-model")
        model = xgb.Booster()
        model.load_model(model_file)

    df_train = pd.read_parquet(train_path)

    print("✅ All data and models loaded successfully")
    return nurse_list, rules, demand, shift_def, model, df_train


# ---- Helper Functions ----
def shift_hours(shift_name, shift_def):
    return shift_def["SHIFT_HOURS"].get(shift_name, 8)


def build_features(nurse, day, shift_type, dept, assigned_shifts, shift_def):
    """Build features for XGBoost prediction"""
    features = {}

    # Nurse characteristics
    features["cand_experience"] = nurse.get("experience_years", 0)
    features["cand_hours_contract"] = nurse.get("contracted_hours", 40)
    seniority_map = {"Junior": 0, "Mid": 1, "Senior": 2}
    features["cand_seniority_num"] = seniority_map.get(nurse.get("seniority_level"), 0)

    # Preferences
    prefs = nurse.get("preferences", [])
    features["pref_morning"] = int("Morning" in prefs)
    features["pref_evening"] = int("Evening" in prefs)
    features["pref_night"] = int("Night" in prefs)

    # Skills
    skills = nurse.get("skills", [])
    for skill in ["ER", "General", "ICU", "OT", "Pediatrics"]:
        features[f"skill_{skill}"] = int(skill in skills)

    # Current workload analysis
    sh_hours = shift_hours(shift_type, shift_def)
    weekly_hours = sum(
        shift_hours(s["shift"], shift_def)
        for s in assigned_shifts.get(nurse["nurse_id"], [])
    )
    daily_hours = sum(
        shift_hours(s["shift"], shift_def)
        for s in assigned_shifts.get(nurse["nurse_id"], [])
        if s["day"] == day
    )
    days_worked = {s["day"] for s in assigned_shifts.get(nurse["nurse_id"], [])}

    features["hours_in_week"] = weekly_hours
    features["would_violate_45"] = int(
        weekly_hours + sh_hours > 45  # Hardcoded for now, should be from rules
    )
    features["would_violate_8_per_day"] = int(
        daily_hours + sh_hours > 8  # Hardcoded for now, should be from rules
    )
    features["has_rest_day"] = int(len(days_worked) < 7)

    return features


def predict_assignment_quality(
    nurse, day, shift_type, dept, assigned_shifts, xgb_model, shift_def
):
    """Use XGBoost to predict the quality/compliance score of an assignment"""
    try:
        features = build_features(
            nurse, day, shift_type, dept, assigned_shifts, shift_def
        )

        # Convert to format expected by XGBoost
        feature_array = np.array([list(features.values())]).astype(float)

        # Get prediction (higher score = better assignment)
        dmatrix = xgb.DMatrix(feature_array)
        score = xgb_model.predict(dmatrix)[0]

        return float(score)
    except Exception as e:
        print(f"Warning: XGBoost prediction failed for nurse {nurse['nurse_id']}: {e}")
        return 0.5  # Default neutral score


def build_and_solve_hybrid(nurses, shift, rules, demand, xgb_model):
    """
    Hybrid approach: CP-SAT for hard constraints + XGBoost for optimal assignments
    """
    model = cp_model.CpModel()

    # Extract configuration
    SHIFT_TIMES = shift["SHIFT_TIMES"]
    SHIFT_HOURS = shift["SHIFT_HOURS"]
    DAYS = rules["general"]["days"]
    DEPARTMENTS = rules["general"]["departments"]
    ALL_SKILLS = rules["general"]["skills"]
    CORE_SKILL = rules["general"]["core_skill"]

    # Constraint settings
    DAILY_HOURS_CAP = rules["constraints"]["daily_hours_cap"]
    WEEKLY_HOUR_CAP = rules["constraints"]["weekly_hours_cap"]
    REST_TIME_HOURS = rules["constraints"]["rest_time_hours"]
    WEEKLY_REST_DAYS = rules["constraints"]["weekly_rest_days"]
    DEPARTMENT_BALANCE_RULE = rules["constraints"]["department_balance"]["enabled"]
    CORE_SKILL_REQUIREMENT = rules["constraints"]["core_skill_requirement"]["enabled"]
    SKILL_MIX_REQUIREMENT = rules["constraints"]["skill_mix_requirement"]["enabled"]

    TIME_SLOTS = list(SHIFT_HOURS.keys())
    day_index = {d: i for i, d in enumerate(DAYS)}

    # Precompute shift timing offsets
    def _to_min(t):
        h, m = map(int, t.split(":"))
        return h * 60 + m

    slot_offsets = {}
    for sname, (st, ed) in SHIFT_TIMES.items():
        smin = _to_min(st)
        emin = _to_min(ed)
        if emin <= smin:
            emin += 24 * 60
        slot_offsets[sname] = (smin, emin)

    # Create assignment variables
    assignment = {}
    for n in nurses:
        nid = n["nurse_id"]
        for dept in DEPARTMENTS:
            for d in DAYS:
                for s in TIME_SLOTS:
                    assignment[(nid, dept, d, s)] = model.NewBoolVar(
                        f"a_{nid}_{dept}_{d}_{s}"
                    )

    # ========== HARD CONSTRAINTS (Labor Laws & Regulations) ==========

    # 1. Daily hours cap (Labor law)
    for n in nurses:
        nid = n["nurse_id"]
        for d in DAYS:
            model.Add(
                sum(
                    assignment[(nid, dept, d, s)] * SHIFT_HOURS[s]
                    for dept in DEPARTMENTS
                    for s in TIME_SLOTS
                )
                <= DAILY_HOURS_CAP
            )

    # 2. Weekly hours cap (Labor law)
    for n in nurses:
        nid = n["nurse_id"]
        model.Add(
            sum(
                assignment[(nid, dept, d, s)] * SHIFT_HOURS[s]
                for dept in DEPARTMENTS
                for d in DAYS
                for s in TIME_SLOTS
            )
            <= WEEKLY_HOUR_CAP
        )

    # 3. Contracted hours equality (Contract requirement)
    for n in nurses:
        nid = n["nurse_id"]
        contracted = int(n.get("contracted_hours", 0))
        if contracted > 0:
            model.Add(
                sum(
                    assignment[(nid, dept, d, s)] * SHIFT_HOURS[s]
                    for dept in DEPARTMENTS
                    for d in DAYS
                    for s in TIME_SLOTS
                )
                == contracted
            )

    # 4. One department per nurse per shift (Physical constraint)
    for n in nurses:
        nid = n["nurse_id"]
        for d in DAYS:
            for s in TIME_SLOTS:
                model.Add(
                    sum(assignment[(nid, dept, d, s)] for dept in DEPARTMENTS) <= 1
                )

    # 5. Minimum coverage requirements (Patient safety)
    for dept in DEPARTMENTS:
        for d in DAYS:
            for s in TIME_SLOTS:
                min_required = demand[dept][d][s]["min"]
                max_required = demand[dept][d][s]["max"]
                model.Add(
                    sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses)
                    >= min_required
                )
                model.Add(
                    sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses)
                    <= max_required
                )

    # 6. Respect unavailability (Legal/contractual)
    for n in nurses:
        nid = n["nurse_id"]
        for ua in n.get("unavailability", []):
            if "-" not in ua:
                continue
            day_str, slot = ua.split("-")
            if day_str in DAYS and slot in TIME_SLOTS:
                for dept in DEPARTMENTS:
                    model.Add(assignment[(nid, dept, day_str, slot)] == 0)

    # 7. Mandatory rest days (Labor law)
    for n in nurses:
        nid = n["nurse_id"]
        rest_day_vars = []
        for d in DAYS:
            daily_vars = [
                assignment[(nid, dept, d, s)]
                for dept in DEPARTMENTS
                for s in TIME_SLOTS
            ]
            rest = model.NewBoolVar(f"rest_{nid}_{d}")
            model.Add(sum(daily_vars) == 0).OnlyEnforceIf(rest)
            model.Add(sum(daily_vars) > 0).OnlyEnforceIf(rest.Not())
            rest_day_vars.append(rest)
        model.Add(sum(rest_day_vars) == WEEKLY_REST_DAYS)

    # 8. Core skill requirements (Patient safety regulation)
    if CORE_SKILL_REQUIREMENT or SKILL_MIX_REQUIREMENT:
        for dept in DEPARTMENTS:
            core_skill = CORE_SKILL[dept]
            for d in DAYS:
                for s in TIME_SLOTS:
                    if demand[dept][d][s]["min"] <= 0:
                        continue

                    if CORE_SKILL_REQUIREMENT:
                        model.Add(
                            sum(
                                assignment[(n["nurse_id"], dept, d, s)]
                                for n in nurses
                                if core_skill in n.get("skills", [])
                            )
                            >= 1
                        )

                    if SKILL_MIX_REQUIREMENT:
                        skill_vars = {}
                        for skill in ALL_SKILLS:
                            v = model.NewBoolVar(
                                f"skill_present_{dept}_{d}_{s}_{skill}"
                            )
                            skilled_nurses_vars = [
                                assignment[(n["nurse_id"], dept, d, s)]
                                for n in nurses
                                if skill in n.get("skills", [])
                            ]
                            if skilled_nurses_vars:
                                model.AddMaxEquality(v, skilled_nurses_vars)
                            else:
                                model.Add(v == 0)
                            skill_vars[skill] = v
                        model.Add(sum(skill_vars.values()) >= 3)

    # 9. Minimum rest between shifts (Labor law)
    for n in nurses:
        nid = n["nurse_id"]
        tasks = []
        for d in DAYS:
            d_idx = day_index[d]
            for s in TIME_SLOTS:
                start_min, end_min = slot_offsets[s]
                start_abs = d_idx * 24 * 60 + start_min
                end_abs = d_idx * 24 * 60 + end_min
                tasks.append((d, s, start_abs, end_abs))

        for i in range(len(tasks)):
            d1, s1, start1, end1 = tasks[i]
            vars1 = [assignment[(nid, dept, d1, s1)] for dept in DEPARTMENTS]

            for j in range(len(tasks)):
                if i == j:
                    continue
                d2, s2, start2, end2 = tasks[j]
                if start2 < start1:
                    continue

                rest_minutes = start2 - end1
                if rest_minutes < REST_TIME_HOURS * 60:
                    vars2 = [assignment[(nid, dept, d2, s2)] for dept in DEPARTMENTS]
                    model.Add(sum(vars1) + sum(vars2) <= 1)

    # 10. Department balance (Operational regulation)
    if DEPARTMENT_BALANCE_RULE:
        for d in DAYS:
            for s in TIME_SLOTS:
                counts = [
                    sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses)
                    for dept in DEPARTMENTS
                ]
                for i in range(len(counts)):
                    for j in range(i + 1, len(counts)):
                        model.Add(counts[i] - counts[j] <= 1)
                        model.Add(counts[j] - counts[i] <= 1)

    # ========== OPTIMIZATION OBJECTIVE (XGBoost-driven) ==========

    print("🧠 Computing XGBoost quality scores for all possible assignments...")

    # Pre-compute XGBoost scores for all possible assignments
    quality_scores = {}
    assigned_shifts = defaultdict(list)  # Start with empty assignments

    total_assignments = len(nurses) * len(DEPARTMENTS) * len(DAYS) * len(TIME_SLOTS)
    computed = 0

    for n in nurses:
        nid = n["nurse_id"]
        for dept in DEPARTMENTS:
            for d in DAYS:
                for s in TIME_SLOTS:
                    # Get XGBoost quality score for this assignment
                    score = predict_assignment_quality(
                        n, d, s, dept, assigned_shifts, xgb_model, shift
                    )

                    # Scale score to integer for CP-SAT (multiply by 1000 for precision)
                    quality_scores[(nid, dept, d, s)] = int(score * 1000)

                    computed += 1
                    if computed % 1000 == 0:
                        print(
                            f"  Computed {computed}/{total_assignments} quality scores..."
                        )

    print(f"✅ Computed all {total_assignments} quality scores")

    # Create objective: maximize XGBoost-predicted quality + basic preferences
    objective_terms = []

    # XGBoost quality scores (primary objective)
    for (nid, dept, d, s), var in assignment.items():
        xgb_score = quality_scores.get((nid, dept, d, s), 500)  # Default neutral score
        objective_terms.append(xgb_score * var)

    # Basic preference bonus (secondary objective, smaller weight)
    preference_bonus = []
    for n in nurses:
        nid = n["nurse_id"]
        prefs = set(p for p in n.get("preferences", []))
        for d in DAYS:
            for s in TIME_SLOTS:
                for p in prefs:
                    if s.endswith(p):
                        for dept in DEPARTMENTS:
                            # Small bonus (100 points) for preference match
                            preference_bonus.append(100 * assignment[(nid, dept, d, s)])

    # Combine objectives (XGBoost scores are weighted much higher)
    total_objective = objective_terms + preference_bonus

    if total_objective:
        model.Maximize(sum(total_objective))
        print(
            f"🎯 Objective includes {len(objective_terms)} XGBoost scores + {len(preference_bonus)} preference bonuses"
        )

    # ========== SOLVE THE MODEL ==========

    print("🔍 Solving optimization model...")
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 300  # 5 minutes for complex problems

    status = solver.Solve(model)

    # ========== RETURN RESULTS ==========

    if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        status_msg = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
        print(f"✅ {status_msg} solution found!")

        solution = {}
        total_xgb_score = 0
        assignment_count = 0

        for (nid, dept, d, s), var in assignment.items():
            if solver.Value(var) == 1:
                if nid not in solution:
                    solution[nid] = []
                solution[nid].append(
                    {
                        "department": dept,
                        "day": d,
                        "shift": s,
                        "hours": SHIFT_HOURS[s],
                        "xgb_quality_score": quality_scores.get((nid, dept, d, s), 500)
                        / 1000.0,
                    }
                )
                total_xgb_score += quality_scores.get((nid, dept, d, s), 500)
                assignment_count += 1

        avg_quality = (
            total_xgb_score / (assignment_count * 1000.0) if assignment_count > 0 else 0
        )
        print(
            f"📊 Solution quality: {avg_quality:.3f} average XGBoost score ({assignment_count} assignments)"
        )

        return solution, status
    else:
        print("❌ No feasible solution found!")
        return None, status


def save_roster_to_s3(roster):
    """Save roster to S3 with timestamped name"""
    current_time = datetime.now().strftime("%d%m%Y")
    roster_filename = f"roster_{current_time}.json"
    local_path = os.path.join("/tmp", roster_filename)  # temp path inside container

    with open(local_path, "w") as f:
        json.dump(roster, f, indent=2)

    s3_key = f"{OUTPUT_PREFIX}{roster_filename}"
    upload_to_s3(local_path, OUTPUT_BUCKET, s3_key)
    print(f"✅ Roster saved to s3://{OUTPUT_BUCKET}/{s3_key}")


def generate_roster():
    """Main Fargate-friendly roster generation function"""
    print("🚀 Starting hybrid CP-SAT + XGBoost roster generation...")

    nurse_list, rules, demand, shift_def, model, df_train = load_data()
    solution, status = build_and_solve_hybrid(
        nurse_list, shift_def, rules, demand, model
    )

    if solution:
        # Format output
        generated = {"departments": []}
        dept_assignments = defaultdict(list)
        for nurse_id, assignments in solution.items():
            for a in assignments:
                dept_assignments[a["department"]].append(
                    {
                        "id": nurse_id,
                        "day": a["day"],
                        "shift": a["shift"],
                        "xgb_score": a["xgb_quality_score"],
                    }
                )

        for dept_name, assigns in dept_assignments.items():
            nurse_map = defaultdict(list)
            for a in assigns:
                nurse_map[a["id"]].append(
                    {
                        "day": a["day"],
                        "shift": a["shift"],
                        "quality_score": a["xgb_score"],
                    }
                )
            nurses_out = []
            for nid, shifts in nurse_map.items():
                nurses_out.append(
                    {
                        "id": nid,
                        "shifts": [
                            {"day": s["day"], "shift": s["shift"]} for s in shifts
                        ],
                    }
                )
            generated["departments"].append({"name": dept_name, "nurses": nurses_out})

        save_roster_to_s3(generated)
        print("🎉 Nurse roster generation completed successfully!")
        return True
    else:
        print("❌ Failed to generate roster")
        return False


def main():
    generate_roster()


if __name__ == "__main__":
    main()
