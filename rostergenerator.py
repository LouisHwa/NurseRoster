import os
import json
import copy
import datetime
import random
from ortools.sat.python import cp_model

# -----------------------------
# Paths
# -----------------------------
data_path = r"C:\Users\waiyi\OneDrive\Documents\GitHub\NurseRoster\Nurse Roster\data"
output_path = r"C:\Users\waiyi\OneDrive\Documents\GitHub\NurseRoster\Nurse Roster\output"
os.makedirs(output_path, exist_ok=True)

# -----------------------------
# Load JSON locally
# -----------------------------
def load_json_local(path):
    with open(path, "r") as f:
        return json.load(f)

# -----------------------------
# Save roster locally
# -----------------------------
def save_roster_local(roster, scenario_name):
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = os.path.join(output_path, f"roster_{scenario_name}_{timestamp}.json")
    with open(file_path, "w") as f:
        json.dump(roster, f, indent=2)
    print(f"Roster saved: {file_path}")

# -----------------------------
# Convert time to minutes
# -----------------------------
def time_to_minutes(t):
    h, m = map(int, t.split(":"))
    return h * 60 + m

# -----------------------------
# Build and solve roster
# -----------------------------
def build_and_solve(nurses, shift, rules, demand, scenario_name="default"):
    model = cp_model.CpModel()
    
    SHIFT_TIMES = shift["SHIFT_TIMES"]
    SHIFT_HOURS = shift["SHIFT_HOURS"]
    DAYS = rules["general"]["days"]
    DEPARTMENTS = rules["general"]["departments"]
    ALL_SKILLS = rules["general"]["skills"]
    CORE_SKILL = rules["general"]["core_skill"]
    
    DAILY_HOURS_CAP = rules["constraints"]["daily_hours_cap"]
    WEEKLY_HOUR_CAP = rules["constraints"]["weekly_hours_cap"]
    REST_TIME_HOURS = rules["constraints"]["rest_time_hours"]
    WEEKLY_REST_DAYS = rules["constraints"]["weekly_rest_days"]
    DEPARTMENT_BALANCE_RULE = rules["constraints"]["department_balance"]["enabled"]
    CORE_SKILL_REQUIREMENT = rules["constraints"]["core_skill_requirement"]["enabled"]
    SKILL_MIX_REQUIREMENT = rules["constraints"]["skill_mix_requirement"]["enabled"]
    
    TIME_SLOTS = list(SHIFT_HOURS.keys())
    
    # Assignment variables
    assignment = {}
    for n in nurses:
        nid = n["nurse_id"]
        for dept in DEPARTMENTS:
            for d in DAYS:
                for s in TIME_SLOTS:
                    assignment[(nid, dept, d, s)] = model.NewBoolVar(f"a_{nid}_{dept}_{d}_{s}")
    
    # -----------------------------
    # Constraints
    # -----------------------------
    # Daily hours
    for n in nurses:
        nid = n["nurse_id"]
        for d in DAYS:
            model.Add(sum(assignment[(nid, dept, d, s)] * SHIFT_HOURS[s] 
                          for dept in DEPARTMENTS for s in TIME_SLOTS) <= DAILY_HOURS_CAP)
    
    # Weekly hours
    for n in nurses:
        nid = n["nurse_id"]
        model.Add(sum(assignment[(nid, dept, d, s)] * SHIFT_HOURS[s] 
                      for dept in DEPARTMENTS for d in DAYS for s in TIME_SLOTS) <= WEEKLY_HOUR_CAP)
    
    # Contracted hours
    for n in nurses:
        nid = n["nurse_id"]
        contracted = int(n["contracted_hours"])
        if contracted > 0:
            model.Add(sum(assignment[(nid, dept, d, s)] * SHIFT_HOURS[s] 
                          for dept in DEPARTMENTS for d in DAYS for s in TIME_SLOTS) == contracted)
    
    # One department per slot
    for n in nurses:
        nid = n["nurse_id"]
        for d in DAYS:
            for s in TIME_SLOTS:
                model.Add(sum(assignment[(nid, dept, d, s)] for dept in DEPARTMENTS) <= 1)
    
    # Coverage demand
    for dept in DEPARTMENTS:
        for d in DAYS:
            for s in TIME_SLOTS:
                min_required = demand[dept][d][s]["min"]
                max_required = demand[dept][d][s]["max"]
                model.Add(sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses) >= min_required)
                model.Add(sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses) <= max_required)
    
    # Nurse unavailability
    for n in nurses:
        for ua in n["unavailability"]:
            if isinstance(ua, str) and "-" in ua:
                parts = ua.split("-")
                if len(parts) == 2:
                    day_str, slot = parts
                    if day_str in DAYS and slot in TIME_SLOTS:
                        for dept in DEPARTMENTS:
                            model.Add(assignment[(n["nurse_id"], dept, day_str, slot)] == 0)
    
    # Rest day constraint
    for n in nurses:
        rest_day_vars = []
        for d in DAYS:
            rest_day = model.NewBoolVar(f"rest_{n['nurse_id']}_{d}")
            daily_assignments = [assignment[(n["nurse_id"], dept, d, s)] for dept in DEPARTMENTS for s in TIME_SLOTS]
            model.Add(sum(daily_assignments) == 0).OnlyEnforceIf(rest_day)
            model.Add(sum(daily_assignments) > 0).OnlyEnforceIf(rest_day.Not())
            rest_day_vars.append(rest_day)
        model.Add(sum(rest_day_vars) == WEEKLY_REST_DAYS)
    
    # Skill requirements
    if CORE_SKILL_REQUIREMENT or SKILL_MIX_REQUIREMENT:
        for dept in DEPARTMENTS:
            core_skill = CORE_SKILL[dept]
            for d in DAYS:
                for s in TIME_SLOTS:
                    model.Add(sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses if core_skill in n["skills"]) >= 1)
                    skill_vars = {}
                    for skill in ALL_SKILLS:
                        skill_var = model.NewBoolVar(f"dept_{dept}_{d}_{s}_{skill}")
                        model.AddMaxEquality(skill_var, [assignment[(n["nurse_id"], dept, d, s)] for n in nurses if skill in n["skills"]])
                        skill_vars[skill] = skill_var
                    model.Add(sum(skill_vars.values()) >= 3)
    
    # Rest time between shifts
    shift_minutes = {}
    for shift_name, (start, end) in SHIFT_TIMES.items():
        start_min = time_to_minutes(start)
        end_min = time_to_minutes(end)
        if end_min <= start_min:
            end_min += 24*60
        shift_minutes[shift_name] = (start_min, end_min)
    
    for nurse in nurses:
        nid = nurse["nurse_id"]
        for i in range(len(DAYS)):
            day = DAYS[i]
            next_day = DAYS[(i+1) % len(DAYS)]
            for s1 in TIME_SLOTS:
                for s2 in TIME_SLOTS:
                    end_s1 = shift_minutes[s1][1]
                    start_s2 = shift_minutes[s2][0]
                    rest_minutes = (24*60 - (end_s1 % (24*60))) + start_s2
                    if rest_minutes < REST_TIME_HOURS*60:
                        model.Add(sum(assignment[(nid, dept, day, s1)] for dept in DEPARTMENTS) +
                                  sum(assignment[(nid, dept, next_day, s2)] for dept in DEPARTMENTS) <= 1)
    
    # Department balance
    if DEPARTMENT_BALANCE_RULE:
        for d in DAYS:
            for s in TIME_SLOTS:
                dept_counts = [sum(assignment[(n["nurse_id"], dept, d, s)] for n in nurses) for dept in DEPARTMENTS]
                for i in range(len(DEPARTMENTS)):
                    for j in range(i+1, len(DEPARTMENTS)):
                        model.Add(dept_counts[i] - dept_counts[j] <= 1)
                        model.Add(dept_counts[j] - dept_counts[i] <= 1)
    
    # Objective: maximize preference matches
    preference_terms = []
    for n in nurses:
        nid = n["nurse_id"]
        prefs = set(n.get("preferences", []))
        for dept in DEPARTMENTS:
            for d in DAYS:
                for s in TIME_SLOTS:
                    for p in prefs:
                        if s.endswith(p):
                            preference_terms.append(assignment[(nid, dept, d, s)])
    if preference_terms:
        model.Maximize(sum(preference_terms))
    
    # Solve
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 120
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print(f"No solution found for scenario {scenario_name}")
        return None
    
    # Build roster
    roster = {"departments": [], "scenario": scenario_name}
    for dept in DEPARTMENTS:
        dept_entry = {"name": dept, "nurses": []}
        for nurse in nurses:
            nid = nurse["nurse_id"]
            nurse_entry = {"id": nid, "shifts": []}
            for d in DAYS:
                for s in TIME_SLOTS:
                    if solver.Value(assignment[(nid, dept, d, s)]) == 1:
                        nurse_entry["shifts"].append({"day": d, "shift": s})
            if nurse_entry["shifts"]:
                dept_entry["nurses"].append(nurse_entry)
        roster["departments"].append(dept_entry)
    
    # Solver stats
    roster["solver_stats"] = {
        "status": solver.StatusName(status),
        "objective_value": solver.ObjectiveValue() if preference_terms else 0,
        "wall_time": solver.WallTime(),
        "num_conflicts": solver.NumConflicts(),
        "num_branches": solver.NumBranches()
    }
    
    save_roster_local(roster, scenario_name)
    return roster

# -----------------------------
# Create N randomized scenarios
# -----------------------------
def create_n_scenarios(base_nurses, base_shift, base_rules, base_demand, n=100):
    scenarios = []
    days = base_rules["general"]["days"]
    time_slots = list(base_shift["SHIFT_HOURS"].keys())
    all_skills = base_rules["general"]["skills"]

    for i in range(n):
        scenario_name = f"scenario_{i+1}"
        nurses_copy = copy.deepcopy(base_nurses)
        demand_copy = copy.deepcopy(base_demand)
        rules_copy = copy.deepcopy(base_rules)

        # Randomize demand ±30%
        for dept in demand_copy:
            for day in days:
                for slot in time_slots:
                    min_val = demand_copy[dept][day][slot]["min"]
                    max_val = demand_copy[dept][day][slot]["max"]
                    factor = random.uniform(0.7, 1.3)
                    demand_copy[dept][day][slot]["min"] = max(1, int(min_val * factor))
                    demand_copy[dept][day][slot]["max"] = max(demand_copy[dept][day][slot]["min"], int(max_val * factor))

        # Random nurse unavailability
        for nurse in nurses_copy:
            if random.random() < 0.2:  # 20% chance to add unavailability
                ua_day = random.choice(days)
                ua_slot = random.choice(time_slots)
                ua_str = f"{ua_day}-{ua_slot}"
                if ua_str not in nurse["unavailability"]:
                    nurse["unavailability"].append(ua_str)

        # Randomize skills
        for nurse in nurses_copy:
            skill_count = random.randint(1, len(all_skills))
            nurse["skills"] = random.sample(all_skills, skill_count)

        # Randomize contracted hours
        min_hours = int(base_rules["constraints"]["daily_hours_cap"] * len(days) / 2)
        max_hours = base_rules["constraints"]["weekly_hours_cap"]
        for nurse in nurses_copy:
            nurse["contracted_hours"] = random.randint(min_hours, max_hours)

        # Randomize core skills per department
        for dept in rules_copy["general"]["departments"]:
            rules_copy["general"]["core_skill"][dept] = random.choice(all_skills)

        scenarios.append({
            "name": scenario_name,
            "nurses": nurses_copy,
            "shift": copy.deepcopy(base_shift),
            "rules": rules_copy,
            "demand": demand_copy
        })
    return scenarios

# -----------------------------
# Generate all rosters
# -----------------------------
def generate_rosters():
    nurses = load_json_local(os.path.join(data_path, "nurse.json"))
    shift = load_json_local(os.path.join(data_path, "shift.json"))
    rules = load_json_local(os.path.join(data_path, "rules.json"))
    demand = load_json_local(os.path.join(data_path, "demand.json"))

    scenarios = create_n_scenarios(nurses, shift, rules, demand, n=100)
   
    results = {}
    for scenario in scenarios:
        print(f"\n➡️ Processing {scenario['name']}")
        roster = build_and_solve(
            scenario["nurses"],
            scenario["shift"],
            scenario["rules"],
            scenario["demand"],
            scenario_name=scenario["name"]
        )
        if roster:
            results[scenario["name"]] = roster
    return results

# -----------------------------
# Main
# -----------------------------
if __name__ == "__main__":
    results = generate_rosters()
    print("\n📊 Completed rosters:")
    for name, roster in results.items():
        stats = roster["solver_stats"]
        print(f"✅ {name}: {stats['status']} "
              f"(Objective: {stats['objective_value']}, Time: {stats['wall_time']:.1f}s)")
