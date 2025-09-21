import os
import json
import copy
import datetime
import random
import time
import concurrent.futures
from typing import Dict, List, Optional
from ortools.sat.python import cp_model

# -----------------------------
# Paths
# -----------------------------
data_path = r"C:\Users\waiyi\OneDrive\Documents\GitHub\NurseRoster\Nurse Roster\data"
output_path = r"C:\Users\waiyi\OneDrive\Documents\GitHub\NurseRoster\Nurse Roster\output"
os.makedirs(output_path, exist_ok=True)

# Create subdirectory for 100 scenarios
scenarios_output_path = os.path.join(output_path, "100_scenarios")
os.makedirs(scenarios_output_path, exist_ok=True)

# -----------------------------
# Configuration
# -----------------------------
TOTAL_SCENARIOS = 100
PARALLEL_WORKERS = 4  # Adjust based on your CPU cores
SOLVER_TIMEOUT = 60   # Reduced timeout for faster generation

# -----------------------------
# Load JSON locally
# -----------------------------
def load_json_local(path):
    with open(path, "r") as f:
        return json.load(f)

# -----------------------------
# Save roster locally with progress tracking
# -----------------------------
def save_roster_local(roster, scenario_name):
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:17]  # Include microseconds
    file_path = os.path.join(scenarios_output_path, f"roster_{scenario_name}_{timestamp}.json")
    
    # Add generation metadata
    roster["generation_metadata"] = {
        "generated_at": datetime.datetime.now().isoformat(),
        "scenario_name": scenario_name,
        "file_path": file_path
    }
    
    with open(file_path, "w") as f:
        json.dump(roster, f, indent=2)
    
    return file_path

# -----------------------------
# Convert time to minutes
# -----------------------------
def time_to_minutes(t):
    h, m = map(int, t.split(":"))
    return h * 60 + m

# -----------------------------
# Enhanced build and solve with better error handling
# -----------------------------
def build_and_solve(nurses, shift, rules, demand, scenario_name="default"):
    """Enhanced version with better performance and error handling"""
    try:
        start_time = time.time()
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
        
        # Apply all constraints (same as your original)
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
        
        # Nurse unavailability (with safe handling)
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
                        # At least 1 with core skill
                        core_nurses = [n for n in nurses if core_skill in n["skills"]]
                        if core_nurses:  # Only add constraint if there are nurses with core skill
                            model.Add(sum(assignment[(n["nurse_id"], dept, d, s)] for n in core_nurses) >= 1)
                        
                        # At least 3 different skills
                        skill_vars = {}
                        for skill in ALL_SKILLS:
                            skill_nurses = [n for n in nurses if skill in n["skills"]]
                            if skill_nurses:  # Only create skill var if there are nurses with this skill
                                skill_var = model.NewBoolVar(f"dept_{dept}_{d}_{s}_{skill}")
                                model.AddMaxEquality(skill_var, [assignment[(n["nurse_id"], dept, d, s)] for n in skill_nurses])
                                skill_vars[skill] = skill_var
                        
                        if len(skill_vars) >= 3:  # Only add constraint if we have at least 3 skills
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
        
        # Solve with optimized parameters
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = SOLVER_TIMEOUT
        solver.parameters.num_search_workers = 2  # Use fewer workers per solve for parallel execution
        solver.parameters.cp_model_presolve = True  # Enable presolve
        solver.parameters.linearization_level = 2  # Better linearization
        
        status = solver.Solve(model)
        
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            print(f"❌ No solution found for {scenario_name}")
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
        
        # Enhanced solver stats
        solve_time = time.time() - start_time
        roster["solver_stats"] = {
            "status": solver.StatusName(status),
            "objective_value": solver.ObjectiveValue() if preference_terms else 0,
            "wall_time": solver.WallTime(),
            "total_time": solve_time,
            "num_conflicts": solver.NumConflicts(),
            "num_branches": solver.NumBranches()
        }
        
        # Save roster
        file_path = save_roster_local(roster, scenario_name)
        print(f"✅ {scenario_name}: {roster['solver_stats']['status']} ({solve_time:.1f}s)")
        
        return roster
        
    except Exception as e:
        print(f"❌ Error in {scenario_name}: {e}")
        return None

# -----------------------------
# Create 100 diverse scenarios with enhanced variety
# -----------------------------
def create_100_scenarios(base_nurses, base_shift, base_rules, base_demand):
    """Create 100 diverse scenarios with different characteristics"""
    scenarios = []
    days = base_rules["general"]["days"]
    time_slots = list(base_shift["SHIFT_HOURS"].keys())
    
    # Set random seed for reproducibility (optional)
    #random.seed(42)
    
    print(f"🎯 Creating {TOTAL_SCENARIOS} diverse scenarios...")
    
    for i in range(TOTAL_SCENARIOS):
        scenario_name = f"scenario_{i+1:03d}"  # 001, 002, etc.
        
        # Deep copy base data
        nurses_copy = copy.deepcopy(base_nurses)
        demand_copy = copy.deepcopy(base_demand)
        rules_copy = copy.deepcopy(base_rules)
        
        # Scenario type based on index to ensure variety
        scenario_type = i % 10  # 10 different scenario types
        
        if scenario_type == 0:  # High demand scenarios
            factor = random.uniform(1.2, 1.5)
            for dept in demand_copy:
                for day in days:
                    for slot in time_slots:
                        min_val = demand_copy[dept][day][slot]["min"]
                        max_val = demand_copy[dept][day][slot]["max"]
                        demand_copy[dept][day][slot]["min"] = max(1, int(min_val * factor))
                        demand_copy[dept][day][slot]["max"] = max(demand_copy[dept][day][slot]["min"], int(max_val * factor))
        
        elif scenario_type == 1:  # Low demand scenarios
            factor = random.uniform(0.6, 0.8)
            for dept in demand_copy:
                for day in days:
                    for slot in time_slots:
                        min_val = demand_copy[dept][day][slot]["min"]
                        max_val = demand_copy[dept][day][slot]["max"]
                        demand_copy[dept][day][slot]["min"] = max(1, int(min_val * factor))
                        demand_copy[dept][day][slot]["max"] = max(demand_copy[dept][day][slot]["min"], int(max_val * factor))
        
        elif scenario_type == 2:  # Weekend heavy scenarios
            weekend_days = ["Saturday", "Sunday"]
            for dept in demand_copy:
                for day in weekend_days:
                    if day in demand_copy[dept]:
                        for slot in time_slots:
                            current_min = demand_copy[dept][day][slot]["min"]
                            demand_copy[dept][day][slot]["min"] = max(1, int(current_min * 1.3))
        
        elif scenario_type == 3:  # High unavailability scenarios
            for nurse in nurses_copy:
                if random.random() < 0.4:  # 40% of nurses get additional unavailability
                    for _ in range(random.randint(1, 3)):  # 1-3 additional unavailable slots
                        ua_day = random.choice(days)
                        ua_slot = random.choice(time_slots)
                        ua_str = f"{ua_day}-{ua_slot}"
                        if ua_str not in nurse["unavailability"] and len(nurse["unavailability"]) < 10:
                            nurse["unavailability"].append(ua_str)
        
        elif scenario_type == 4:  # Flexible hours scenarios
            rules_copy["constraints"]["weekly_hours_cap"] = random.choice([44, 48, 52])
            rules_copy["constraints"]["daily_hours_cap"] = random.choice([10, 12])
        
        elif scenario_type == 5:  # Emergency scenarios (tight staffing)
            for dept in demand_copy:
                for day in days:
                    for slot in time_slots:
                        min_val = demand_copy[dept][day][slot]["min"]
                        demand_copy[dept][day][slot]["max"] = min_val  # max = min
        
        elif scenario_type == 6:  # Variable demand across days
            for dept in demand_copy:
                for day_idx, day in enumerate(days):
                    factor = 0.7 + (day_idx * 0.1)  # Gradual increase through the week
                    for slot in time_slots:
                        min_val = demand_copy[dept][day][slot]["min"]
                        max_val = demand_copy[dept][day][slot]["max"]
                        demand_copy[dept][day][slot]["min"] = max(1, int(min_val * factor))
                        demand_copy[dept][day][slot]["max"] = max(demand_copy[dept][day][slot]["min"], int(max_val * factor))
        
        elif scenario_type == 7:  # Night shift heavy scenarios
            night_shifts = [slot for slot in time_slots if "Night" in slot]
            if night_shifts:
                for dept in demand_copy:
                    for day in days:
                        for slot in night_shifts:
                            current_min = demand_copy[dept][day][slot]["min"]
                            demand_copy[dept][day][slot]["min"] = max(1, int(current_min * 1.4))
        
        elif scenario_type == 8:  # Reduced rest time scenarios
            rules_copy["constraints"]["rest_time_hours"] = random.choice([8, 10])
        
        else:  # Mixed random scenarios
            # Random demand variation
            for dept in demand_copy:
                for day in days:
                    for slot in time_slots:
                        factor = random.uniform(0.8, 1.2)
                        min_val = demand_copy[dept][day][slot]["min"]
                        max_val = demand_copy[dept][day][slot]["max"]
                        demand_copy[dept][day][slot]["min"] = max(1, int(min_val * factor))
                        demand_copy[dept][day][slot]["max"] = max(demand_copy[dept][day][slot]["min"], int(max_val * factor))
            
            # Random nurse unavailability
            for nurse in nurses_copy:
                if random.random() < 0.2:  # 20% chance
                    ua_day = random.choice(days)
                    ua_slot = random.choice(time_slots)
                    ua_str = f"{ua_day}-{ua_slot}"
                    if ua_str not in nurse["unavailability"]:
                        nurse["unavailability"].append(ua_str)
        
        scenarios.append({
            "name": scenario_name,
            "nurses": nurses_copy,
            "shift": copy.deepcopy(base_shift),
            "rules": rules_copy,
            "demand": demand_copy,
            "type": scenario_type
        })
        
        # Progress indicator
        if (i + 1) % 20 == 0:
            print(f"📊 Created {i + 1} scenarios...")
    
    print(f"✅ Created all {TOTAL_SCENARIOS} scenarios!")
    return scenarios

# -----------------------------
# Parallel processing function
# -----------------------------
def solve_scenario(scenario_data):
    """Solve a single scenario - for parallel processing"""
    return build_and_solve(
        scenario_data["nurses"],
        scenario_data["shift"],
        scenario_data["rules"],
        scenario_data["demand"],
        scenario_name=scenario_data["name"]
    )

# -----------------------------
# Generate 100 rosters with parallel processing
# -----------------------------
def generate_100_rosters():
    """Generate 100 roster scenarios with optimized parallel processing"""
    print("🏥 Hospital Roster Generator - 100 Scenarios")
    print("=" * 60)
    
    # Load base data
    print("📥 Loading base data...")
    nurses = load_json_local(os.path.join(data_path, "nurse.json"))
    shift = load_json_local(os.path.join(data_path, "shift.json"))
    rules = load_json_local(os.path.join(data_path, "rules.json"))
    demand = load_json_local(os.path.join(data_path, "demand.json"))
    
    print(f"✅ Loaded: {len(nurses)} nurses, {len(shift['SHIFT_HOURS'])} shifts")
    
    # Create scenarios
    start_time = time.time()
    scenarios = create_100_scenarios(nurses, shift, rules, demand)
    
    # Generate rosters
    print(f"\n🚀 Starting generation of {TOTAL_SCENARIOS} rosters...")
    print(f"⚙️ Using {PARALLEL_WORKERS} parallel workers")
    print(f"⏱️ Solver timeout: {SOLVER_TIMEOUT}s per scenario")
    print("=" * 60)
    
    results = {}
    successful = 0
    failed = 0
    
    # Process scenarios in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=PARALLEL_WORKERS) as executor:
        # Submit all scenarios
        future_to_scenario = {executor.submit(solve_scenario, scenario): scenario for scenario in scenarios}
        
        # Collect results as they complete
        for future in concurrent.futures.as_completed(future_to_scenario):
            scenario = future_to_scenario[future]
            try:
                result = future.result()
                if result:
                    results[scenario["name"]] = result
                    successful += 1
                else:
                    failed += 1
                
                # Progress update
                total_completed = successful + failed
                if total_completed % 10 == 0:
                    elapsed = time.time() - start_time
                    avg_time = elapsed / total_completed
                    eta = avg_time * (TOTAL_SCENARIOS - total_completed)
                    print(f"📊 Progress: {total_completed}/{TOTAL_SCENARIOS} ({successful} successful, {failed} failed) - ETA: {eta:.1f}s")
                    
            except Exception as e:
                print(f"❌ Exception in {scenario['name']}: {e}")
                failed += 1
    
    # Final summary
    total_time = time.time() - start_time
    print(f"\n🎉 GENERATION COMPLETE!")
    print("=" * 60)
    print(f"📊 Results:")
    print(f"   Total scenarios: {TOTAL_SCENARIOS}")
    print(f"   Successful: {successful}")
    print(f"   Failed: {failed}")
    print(f"   Success rate: {(successful/TOTAL_SCENARIOS)*100:.1f}%")
    print(f"   Total time: {total_time:.1f} seconds")
    print(f"   Average time per scenario: {total_time/TOTAL_SCENARIOS:.1f} seconds")
    print(f"📁 Output directory: {scenarios_output_path}")
    
    # Save summary report
    summary = {
        "generation_summary": {
            "total_scenarios": TOTAL_SCENARIOS,
            "successful": successful,
            "failed": failed,
            "success_rate": (successful/TOTAL_SCENARIOS)*100,
            "total_time_seconds": total_time,
            "average_time_per_scenario": total_time/TOTAL_SCENARIOS,
            "generated_at": datetime.datetime.now().isoformat(),
            "output_directory": scenarios_output_path
        },
        "successful_scenarios": [name for name in results.keys()],
        "scenario_stats": {name: roster["solver_stats"] for name, roster in results.items()}
    }
    
    summary_path = os.path.join(scenarios_output_path, f"generation_summary_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    
    print(f"📋 Summary saved: {summary_path}")
    
    return results

# -----------------------------
# Main execution
# -----------------------------
if __name__ == "__main__":
    print(f"🎯 Target: {TOTAL_SCENARIOS} scenarios")
    print(f"⚙️ Parallel workers: {PARALLEL_WORKERS}")
    print(f"⏱️ Solver timeout: {SOLVER_TIMEOUT}s")
    
    # Ask for confirmation
    response = input("\n🚀 Start generation? (y/N): ").strip().lower()
    if response in ['y', 'yes']:
        results = generate_100_rosters()
        
        if results:
            print(f"\n📈 TOP 10 FASTEST SCENARIOS:")
            sorted_results = sorted(results.items(), key=lambda x: x[1]["solver_stats"]["total_time"])
            for i, (name, roster) in enumerate(sorted_results[:10]):
                stats = roster["solver_stats"]
                print(f"  {i+1}. {name}: {stats['total_time']:.1f}s - {stats['status']}")
        
        print(f"\n✅ All done! Check {scenarios_output_path} for your 100 roster scenarios.")
    else:
        print("👋 Generation cancelled.")