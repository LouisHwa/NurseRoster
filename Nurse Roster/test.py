import json
import os
import datetime
import pytz
from ortools.sat.python import cp_model
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials

# === Config ===
TIMEZONE = "Asia/Kuala_Lumpur"
DEPARTMENTS = ["General", "ICU", "ER"]  # the 3 departments
ALL_SKILLS = ["General", "ICU", "ER", "OT", "Pediatrics"]  # possible skills in nurse["skills"]
MIN_REST_HOURS = 12
CORE_SKILL = {
    "General": "General",
    "ICU": "ICU",
    "ER": "ER",
    # extend if more departments
}

SHIFT_TIMES = {
    "Full-Morning": ("08:00", "16:00"),
    "Full-Evening": ("16:00", "00:00"),
    "Full-Night": ("00:00", "08:00"),
    "Half-Morning": ("08:00", "12:00"),
    "Half-Evening": ("16:00", "20:00"),
    "Half-Night": ("00:00", "04:00"),
}

SHIFT_HOURS = {
    "Full-Morning": 8, "Full-Evening": 8, "Full-Night": 8,
    "Half-Morning": 4, "Half-Evening": 4, "Half-Night": 4
}

# Unit values for fairness (avoid fractions): Full -> 2, Half -> 1 (so 8h => 2 units, 4h => 1 unit).
UNIT_PER_SHIFT = {s: (2 if SHIFT_HOURS[s] == 8 else 1) for s in SHIFT_HOURS}

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
TIME_SLOTS = list(SHIFT_HOURS.keys())

# Coverage
DEMAND_PER_FULL_SHIFT = 2
DEMAND_PER_HALF_SHIFT = 1
MAX_DEMAND_PER_FULL_SHIFT = 4
MAX_DEMAND_PER_HALF_SHIFT = 2

FAIRNESS_MAX_UNIT_DIFF = 3  # corresponds to <=1 in original units (1 == 8h diff = 1 unit -> *2 => 2)
WEEKLY_HOUR_CAP = 45

# ---------------------------
# Helpers
# ---------------------------
def load_nurses(path="Nurse Roster/data/nurse.json"):
    with open(path, "r") as f:
        nurses = json.load(f)
    for n in nurses:
        n.setdefault("unavailability", [])  # list like "Tue-Morning"
        n.setdefault("skills", [])  # e.g., ["general","ICU"]
        n["contracted_hours"] = int(n.get("contracted_hours", 0))
        n.setdefault("preferences", [])  # e.g., ["Morning"]
    return nurses

def time_to_minutes(t):
        h, m = map(int, t.split(":"))
        return h * 60 + m

# ---------------------------
# Build and solve
# ---------------------------
def build_and_solve(nurses):
    model = cp_model.CpModel()

    # Create assignment boolean variables indexed by (nurse_id, department, day, slot)
    assignment = {}
    for n in nurses:
        nid = n["nurse_id"]
        for dept in DEPARTMENTS:
            for d in DAYS:
                for s in TIME_SLOTS:
                    assignment[(nid, dept, d, s)] = model.NewBoolVar(f"a_{nid}_{dept}_{d}_{s}")

    # Constraints 2: Daily hours constraint: sum across departments for that nurse-day <= 8
    for n in nurses:
        nid = n["nurse_id"]
        for d in DAYS:
            model.Add(
                sum(assignment[(nid, dept, d, s)] * SHIFT_HOURS[s] for dept in DEPARTMENTS for s in TIME_SLOTS) <= 8
            )

    # Constraints 3: Weekly hours cap
    for n in nurses:
        nid = n["nurse_id"]
        model.Add(
            sum(assignment[(nid, dept, d, s)] * SHIFT_HOURS[s] for dept in DEPARTMENTS for d in DAYS for s in TIME_SLOTS) <= WEEKLY_HOUR_CAP
        )

    # Constraints 4: Contracted hours (at least contracted_hours) - hard equality or >=? user asked "at least"
    for n in nurses:
        nid = n["nurse_id"]
        contracted = int(n["contracted_hours"])
        if contracted > 0:
            model.Add(
                sum(assignment[(nid, dept, d, s)] * SHIFT_HOURS[s] for dept in DEPARTMENTS for d in DAYS for s in TIME_SLOTS) == contracted
            )

    # Constraints 1: A nurse can be assigned to at most one department in the same day-slot
    for n in nurses:
        nid = n["nurse_id"]
        for d in DAYS:
            for s in TIME_SLOTS:
                model.Add(sum(assignment[(nid, dept, d, s)] for dept in DEPARTMENTS) <= 1)
                

    # Constraints 6: Coverage constraint: each shift in each department must respect min/max demand
    for dept in DEPARTMENTS:
        for d in DAYS:
            for s in TIME_SLOTS:
                if s.startswith("Full-"):
                    model.Add(
                        sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses) >= DEMAND_PER_FULL_SHIFT
                    )
                    model.Add(
                        sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses) <= MAX_DEMAND_PER_FULL_SHIFT
                    )
                else:  # Half shifts
                    model.Add(
                        sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses) >= DEMAND_PER_HALF_SHIFT
                    )
                    model.Add(
                        sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses) <= MAX_DEMAND_PER_HALF_SHIFT
                    )

    # Constraints 7: Respect nurse unavailability (high priority)
    for n in nurses:
        for ua in n["unavailability"]:
            day_str, slot = ua.split("-")   # e.g. "Tue-Morning"
            for dept in DEPARTMENTS:
                model.Add(assignment[(n["nurse_id"], dept, day_str, slot)] == 0)

    # Constraints 8: Each nurse must have exactly 1 rest day (completely off) per week
    for n in nurses:
        rest_day_vars = []
        for d in DAYS:
            # rest_day[d] = 1 if nurse has no shifts on this day
            rest_day = model.NewBoolVar(f"rest_{n['nurse_id']}_{d}")
            
            # Count total shifts assigned to this nurse on this day
            daily_assignments = []
            for dept in DEPARTMENTS:
                for s in TIME_SLOTS:
                    daily_assignments.append(assignment[(n["nurse_id"], dept, d, s)])
            
            # If sum of assignments == 0 → rest_day = 1
            model.Add(sum(daily_assignments) == 0).OnlyEnforceIf(rest_day)
            model.Add(sum(daily_assignments) > 0).OnlyEnforceIf(rest_day.Not())
            
            rest_day_vars.append(rest_day)
        
        # Exactly one rest day in the week
        model.Add(sum(rest_day_vars) == 1)

    # Constraints 9: 
    for dept in DEPARTMENTS:
        core_skill = CORE_SKILL[dept]
        
        for d in DAYS:
            for s in TIME_SLOTS:
                # -----------------------------
                # 1) At least 1 with core skill
                # -----------------------------
                model.Add(sum(assignment[(n["nurse_id"], dept, d, s)]for n in nurses if core_skill in n["skills"]) >= 1)
                
                # -----------------------------
                # 2) At least 3 different skillsets overall
                # -----------------------------
                skill_vars = {}
                for skill in ALL_SKILLS:
                    skill_var = model.NewBoolVar(f"dept_{dept}_{d}_{s}_{skill}")
                    # skill_var = 1 if at least one nurse with this skill is assigned
                    model.AddMaxEquality(skill_var, [assignment[(n["nurse_id"], dept, d, s)] for n in nurses if skill in n["skills"]])
                    skill_vars[skill] = skill_var
                
                # Require at least 3 different skills in this shift
                model.Add(sum(skill_vars.values()) >= 3)
    
    
    # Constraints 10: 
    shift_minutes = {}
    for shift_name, (start, end) in SHIFT_TIMES.items():
        start_min = time_to_minutes(start)
        end_min = time_to_minutes(end)
        # If end <= start treat as overnight and add 24h so end_min > start_min
        if end_min <= start_min:
            end_min += 24 * 60
        shift_minutes[shift_name] = (start_min, end_min)

    # Cross-day rest constraint for each nurse (use day strings, include wrap-around)
    for nurse in nurses:
        nid = nurse["nurse_id"]
        for i in range(len(DAYS)):
            day = DAYS[i]
            next_day = DAYS[(i + 1) % len(DAYS)]  # include Sunday->Monday wrap if desired
            for s1 in TIME_SLOTS:
                for s2 in TIME_SLOTS:
                    end_s1 = shift_minutes[s1][1]
                    start_s2 = shift_minutes[s2][0]

                    # compute rest between end of s1 on day and start of s2 on next_day
                    # use modulo to handle any end_min that may exceed 24h
                    rest_minutes = (24 * 60 - (end_s1 % (24 * 60))) + start_s2

                    if rest_minutes < MIN_REST_HOURS * 60:
                        # restrict sum of any assignment on day (any dept) + any assignment on next_day (any dept)
                        model.Add(
                            sum(assignment[(nid, dept, day, s1)] for dept in DEPARTMENTS)
                            + sum(assignment[(nid, dept, next_day, s2)] for dept in DEPARTMENTS)
                            <= 1
                        )
    # Constraint 11: Shift in all departments cannot have a difference of more than 1
    for d in DAYS:
        for s in TIME_SLOTS:
            dept_counts = [sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses) for dept in DEPARTMENTS]

            for i in range(len(DEPARTMENTS)):
                for j in range(i+1, len(DEPARTMENTS)):
                    # Difference between dept i and j must be ≤ 1
                    model.Add(dept_counts[i] - dept_counts[j] <= 1)
                    model.Add(dept_counts[j] - dept_counts[i] <= 1)


    # Constraints 5: 
    # Preference soft objective (low priority): maximize assignments that match nurse preference (Morning/Evening/Night)
    # We'll sum preference matches and maximize. Keep objective single maximize since fairness & other constraints are hard.
    preference_terms = []
    for n in nurses:
        nid = n["nurse_id"]
        prefs = set(p for p in n.get("preferences", []))
        if not prefs:
            continue
        for dept in DEPARTMENTS:
            for d in DAYS:
                for s in TIME_SLOTS:
                    # if slot endswith a preferred part, reward it
                    for p in prefs:
                        if s.endswith(p):
                            preference_terms.append(assignment[(nid, dept, d, s)])

    model.Maximize(sum(preference_terms))

    # ---------------------------
    # Solve
    # ---------------------------
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("No solution found (infeasible).")
        return None

    roster = {"departments": []}

    for dept in DEPARTMENTS:
        dept_entry = {"name": dept, "nurses": []}

        for nurse in nurses:
            nid = nurse["nurse_id"]
            nurse_entry = {"id": nid, "shifts": []}

            for d in DAYS:
                for s in TIME_SLOTS:
                    if solver.Value(assignment[(nid, dept, d, s)]) == 1:
                        nurse_entry["shifts"].append({
                            "day": d,
                            "shift": s
                        })

            if nurse_entry["shifts"]:  # only include nurses who actually work
                dept_entry["nurses"].append(nurse_entry)

        roster["departments"].append(dept_entry)

    with open("output.json", "w") as f:
        json.dump(roster, f, indent=2)

    print("✅ Roster saved to output.json")

    return roster

if __name__ == "__main__":
    nurses = load_nurses("Nurse Roster/data/nurse.json")
    res = build_and_solve(nurses)
    if not res:
        exit(1)
