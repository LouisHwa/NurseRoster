import json 
import os
import datetime
import pytz
from ortools.sat.python import cp_model
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials

SCOPES = ['https://www.googleapis.com/auth/calendar']
TIMEZONE = "Asia/Kuala_Lumpur"
SHIFT_TIMES = {
    "Full-Morning": ("08:00", "16:00"),
    "Full-Evening": ("16:00", "00:00"),
    "Full-Night": ("00:00", "08:00"),
    "Half-Morning": ("08:00", "12:00"),
    "Half-Evening": ("16:00", "20:00"),
    "Half-Night": ("00:00", "04:00"),
}

SHIFT_HOURS = {"Full-Morning": 8, "Full-Evening": 8, "Full-Night": 8, "Half-Morning": 4, "Half-Evening": 4, "Half-Night": 4}

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# Morning 6am - 2pm
# Afternoon 2pm - 10pm
# Night 10pm - 6am
TIME_SLOTS = ["Full-Morning", "Full-Evening", "Full-Night", "Half-Morning", "Half-Evening", "Half-Night"]

# Constraint 4: full-shift demand (can be changed)
DEMAND_PER_FULL_SHIFT = 3  
DEMAND_PER_HALF_SHIFT = 1  
FAIRNESS_MAX_HOUR_DIFF = 8
WEEKLY_HOUR_CAP = 45

def load_nurses(path="Nurse Roster/data/nurse.json"):
    with open(path, "r") as f:
        nurses = json.load(f)
    # Normalize any fields used below:
    for n in nurses:
        n.setdefault("availability_exceptions", [])  # list of "Day-Slot" that are unavailable
        # keep contracted_hours in integer
        n["contracted_hours"] = int(n.get("contracted_hours", 0))
        # preferences: may contain "Morning"/"Evening"/"Night" strings
        n.setdefault("preferences", [])
        # For backwards compatibility: if nurse has "availability" that lists allowed slots,
        # we will treat anything not listed as unavailable. If you use exceptions model, prefer "unavailable".
    return nurses

# ---------------------------
# Google Calendar service
# ---------------------------
def get_calendar_service():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file('Nurse Roster/data/credentials.json', SCOPES)
        creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    service = build('calendar', 'v3', credentials=creds)
    return service

def get_or_create_calendar(service, calendar_name="Nurse Roster Schedule"):
    # Check existing calendars
    calendar_list = service.calendarList().list().execute()
    for cal in calendar_list.get("items", []):
        if cal["summary"] == calendar_name:
            print(f"Using existing calendar: {calendar_name}")
            return cal["id"]
    
    # If not found, create a new one
    calendar = {
        "summary": calendar_name,
        "timeZone": "Asia/Kuala_Lumpur"
    }
    created_cal = service.calendars().insert(body=calendar).execute()
    print(f"Created new calendar: {calendar_name}")
    return created_cal["id"]

# ---------------------------
# Create Google Calendar event
# ---------------------------
def create_shift_event(service, calender_id, nurse_id, day_date, shift_name):
    start_str, end_str = SHIFT_TIMES[shift_name]
    start_dt = datetime.datetime.combine(day_date, datetime.datetime.strptime(start_str, "%H:%M").time())
    end_dt = datetime.datetime.combine(day_date, datetime.datetime.strptime(end_str, "%H:%M").time())
    if end_dt <= start_dt:
        end_dt += datetime.timedelta(days=1)

    event = {
        "summary": f"{nurse_id} - {shift_name}",
        "start": {"dateTime": start_dt.isoformat(), "timeZone": TIMEZONE},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": TIMEZONE},
    }

    service.events().insert(calendarId=calender_id, body=event).execute()
    print(f"Created event: {nurse_id} on {day_date} ({shift_name})")


# ---------------------------
# Build and solve schedule
# ---------------------------
def build_and_solve(nurses):
    model = cp_model.CpModel()

    # Variables: assignment[(nurse_id, day, slot)] ∈ {0,1}
    assignment = {}
    for n in nurses:
        nid = n["nurse_id"]
        for d in DAYS:
            for s in TIME_SLOTS:
                assignment[(nid, d, s)] = model.NewBoolVar(f"a_{nid}_{d}_{s}")

    # ---------------------------
    # Constraint 1: Max 8 hours/day per nurse
    #   sum over slots on a day of (assignment * slot_hours) <= 8
    # ---------------------------
    for n in nurses:
        nid = n["nurse_id"]
        for d in DAYS:
            model.Add(
                sum(assignment[(nid, d, s)] * SHIFT_HOURS[s] for s in TIME_SLOTS) <= 8
            )

    # ---------------------------
    # Constraint 3: Max 45 hours/week per nurse (labour law)
    # ---------------------------
    for n in nurses:
        nid = n["nurse_id"]
        model.Add(
            sum(assignment[(nid, d, s)] * SHIFT_HOURS[s] for d in DAYS for s in TIME_SLOTS) <= WEEKLY_HOUR_CAP
        )

    # ---------------------------
    # Constraint 2: Each nurse should work AT LEAST their contracted_hours (weekly)
    #   Note: This is a hard constraint here. If infeasible, convert to soft.
    # ---------------------------
    for n in nurses:
        nid = n["nurse_id"]
        contracted = int(n["contracted_hours"])
        # If contracted is 0, skip enforcing a lower bound
        if contracted > 0:
            model.Add(
                sum(assignment[(nid, d, s)] * SHIFT_HOURS[s] for d in DAYS for s in TIME_SLOTS) == contracted
            )

    # ---------------------------
    # Constraint 4: Shift coverage - full shifts need at least 3 nurses
    # ---------------------------
    for d in DAYS:
        for s in TIME_SLOTS:
            if s.startswith("Full-"):
                model.Add(
                    sum(assignment[(n["nurse_id"], d, s)] for n in nurses) >= DEMAND_PER_FULL_SHIFT
                )
            else:
                # For half shifts we keep a configurable minimum (here 0)
                if DEMAND_PER_HALF_SHIFT > 0:
                    model.Add(
                        sum(assignment[(n["nurse_id"], d, s)] for n in nurses) >= DEMAND_PER_HALF_SHIFT
                    )

    # ---------------------------
    # Constraint 6 (fair distribution high priority):
    #   For any pair of nurses, difference in weekly hours <= FAIRNESS_MAX_HOUR_DIFF (8h)
    # ---------------------------
    # Precompute each nurse total-hours var
    total_hours = {}
    max_possible_hours = len(DAYS) * 8  # safe upper bound (one full shift per day)
    for n in nurses:
        nid = n["nurse_id"]
        th = model.NewIntVar(0, max_possible_hours, f"total_hours_{nid}")
        model.Add(th == sum(assignment[(nid, d, s)] * SHIFT_HOURS[s] for d in DAYS for s in TIME_SLOTS))
        total_hours[nid] = th

    # Pairwise abs differences
    nurse_ids = [n["nurse_id"] for n in nurses]
    for i in range(len(nurse_ids)):
        for j in range(i + 1, len(nurse_ids)):
            a = total_hours[nurse_ids[i]]
            b = total_hours[nurse_ids[j]]
            diff = model.NewIntVar(0, max_possible_hours, f"diff_{nurse_ids[i]}_{nurse_ids[j]}")
            model.AddAbsEquality(diff, a - b)
            model.Add(diff <= FAIRNESS_MAX_HOUR_DIFF)

    # ---------------------------
    # Constraint 6 (Respect nurses unavailability) [high priority]
    #   We expect nurses to either provide an "unavailable" list of Day-Slot strings,
    #   OR an "availability" list (allowed slots). We'll support both:
    #   - If nurse has 'unavailable' list -> assignment == 0 for those.
    #   - Else if nurse has 'availability' list -> ANY slot not in availability -> assignment == 0.
    # ---------------------------
    for n in nurses:
        nid = n["nurse_id"]
        # use explicit "unavailable" if present
        unavailable = set(n.get("unavailable", []))
        avail_list = n.get("availability", None)  # old-style: allowed slots
        # Build set of allowed slots if availability provided
        allowed = None
        if avail_list:
            # Convert "Mon-Morning" style to "Mon-Full-Morning" or "Mon-Half-Morning"? 
            # We'll interpret "Morning"/"Evening"/"Night" as both Full and Half allowed.
            allowed = set()
            for a in avail_list:
                # a like "Mon-Morning" or "Tue-Evening"
                try:
                    day, part = a.split("-", 1)
                except ValueError:
                    continue
                for st in TIME_SLOTS:
                    if st.endswith(part):
                        allowed.add(f"{day}-{st}")
        # Enforce
        for d in DAYS:
            for s in TIME_SLOTS:
                key = f"{d}-{s}"
                if key in unavailable:
                    model.Add(assignment[(nid, d, s)] == 0)
                elif allowed is not None:
                    if key not in allowed:
                        model.Add(assignment[(nid, d, s)] == 0)
                # else default: available (do nothing)

    # ---------------------------
    # Constraint: Avoid assigning overlapping half+full that exceed hours per day
    # (Already covered by daily hours max 8 constraint)
    # ---------------------------

    # ---------------------------
    # Soft objective: preferences (low priority)
    #   Reward assigning a nurse to a slot that matches their preference (Morning/Evening/Night)
    # ---------------------------
    preference_terms = []
    for n in nurses:
        nid = n["nurse_id"]
        prefs = set(n.get("preferences", []))  # e.g., {"Morning"}
        if not prefs:
            continue
        for d in DAYS:
            for s in TIME_SLOTS:
                # If slot endswith "Morning" and nurse prefers "Morning", reward it.
                for p in prefs:
                    if s.endswith(p):
                        # convert BoolVar to IntVar by multiplying 1*boolVar (ok in linear expr)
                        preference_terms.append(assignment[(nid, d, s)])

    # Build final objective: maximize total preferences (low weight)
    # If you want multi-objective, you can add fairness minimization here as soft term as well.
    model.Maximize(sum(preference_terms))

    # ---------------------------
    # Solve
    # ---------------------------
    solver = cp_model.CpSolver()
    # You can tune time limit
    solver.parameters.max_time_in_seconds = 20
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("No solution found (infeasible).")
        return None

    # Extract schedule
    schedule = {d: {s: [] for s in TIME_SLOTS} for d in DAYS}
    nurse_hours = {}
    for n in nurses:
        nid = n["nurse_id"]
        nurse_hours[nid] = solver.Value(total_hours[nid])
    for d in DAYS:
        for s in TIME_SLOTS:
            for n in nurses:
                nid = n["nurse_id"]
                if solver.Value(assignment[(nid, d, s)]) == 1:
                    schedule[d][s].append(nid)

    return {"schedule": schedule, "nurse_hours": nurse_hours, "status": status}



# ---------------------------
# Demo runner (if run as script)
# ---------------------------
if __name__ == "__main__":
    nurses = load_nurses("Nurse Roster/data/nurse.json")
    res = build_and_solve(nurses)
    if not res:
        exit(1)

    print("\nWeekly schedule (nurse ids listed per shift):")
    for d in DAYS:
        print(f"\n{d}:")
        for s in TIME_SLOTS:
            assigned = res["schedule"][d][s]
            print(f"  {s}: {', '.join(assigned) if assigned else '-'}")


    print("\nTotal hours per nurse (weekly):")
    for nid, hrs in res["nurse_hours"].items():
        print(f"  {nid}: {hrs}h")

    # ---------------------------
    # Push to Google Calendar
    # ---------------------------
    service = get_calendar_service()
    calendar_id = get_or_create_calendar(service, "Nurse Roster Schedule")

    week_start = datetime.date(2025, 9, 16)  # Adjust to Monday of schedule
    for i, day in enumerate(DAYS):
        day_date = week_start + datetime.timedelta(days=i)
        for shift_name, nurses_in_shift in res["schedule"][day].items():
            for nid in nurses_in_shift:
                create_shift_event(service, calendar_id, nid, day_date, shift_name)
