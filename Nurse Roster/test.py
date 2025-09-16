import json 
from ortools.sat.python import cp_model

with open("Nurse Roster/data/nurse.json", "r") as f:
    nurses = json.load(f)


days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
time_slots = ["Morning", "Evening", "Night"]

model = cp_model.CpModel()
assignment = {}

for nurse in nurses:
    for day in days:
        for slot in time_slots:
            assignment[(nurse["nurse_id"], day, slot)] = model.NewBoolVar(f"{nurse['nurse_id']}_{day}_{slot}")

# print(assignment)

# Constraint 1: One shift per nurse per day
for nurse in nurses:
    for day in days:
        model.Add(sum(assignment[(nurse["nurse_id"], day, slot)] for slot in time_slots) <= 1)

# Constraint 2: Exactly one nurse per shift per day
for day in days:
    for slot in time_slots:
        model.Add(sum(assignment[(nurse["nurse_id"], day, slot)] for nurse in nurses) == 1)

# Constraint 3: Each nurse works at most 2 shifts per week
for nurse in nurses:
    model.Add(
        sum(assignment[(nurse["nurse_id"], day, slot)] 
            for day in days 
            for slot in time_slots) <= 2
    )

total_shifts = len(days) * len(time_slots)
min_shifts = total_shifts // len(nurses)      # floor
max_shifts = -(-total_shifts // len(nurses))  # ceil

for nurse in nurses:
    total_nurse_shifts = sum(
        assignment[(nurse["nurse_id"], day, slot)]
        for day in days for slot in time_slots
    )
    model.Add(total_nurse_shifts >= min_shifts)
    model.Add(total_nurse_shifts <= max_shifts)


avg = total_shifts / len(nurses)
fairness_terms = []
for nurse in nurses:
    total_nurse_shifts = sum(
        assignment[(nurse["nurse_id"], day, slot)]
        for day in days for slot in time_slots
    )
    # Penalize deviation from average workload
    diff = model.NewIntVar(-21, 21, f"diff_{nurse['nurse_id']}")
    abs_diff = model.NewIntVar(0, 21, f"abs_diff_{nurse['nurse_id']}")
    model.Add(diff == total_nurse_shifts - int(avg))
    model.AddAbsEquality(abs_diff, diff)
    fairness_terms.append(abs_diff)

# Objective: preferences
preference_terms = []
for nurse in nurses:
    for day in days:
        for slot in time_slots:
            if slot in nurse["preferences"]:
                preference_terms.append(assignment[(nurse["nurse_id"], day, slot)])


model.Maximize(sum(preference_terms))

# Solve
solver = cp_model.CpSolver()
status = solver.Solve(model)

if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
    for day in days:
        print(f"\n{day}")
        for slot in time_slots:
            for nurse in nurses:
                if solver.Value(assignment[(nurse["nurse_id"], day, slot)]) == 1:
                    print(f"  {slot}: {nurse['name']}")
else:
    print("No solution found.")
