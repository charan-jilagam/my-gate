#!/usr/bin/env python3
"""
Nivora - delete everything except users who logged in during the past N days.

KEEPS
  * users whose `lastLogin` is within the last N days (default 10)
  * super_admin accounts (always; without them nobody can run the platform)
  * every record owned by a kept user
  * societies that still have at least one kept user

DELETES (completely)
  * every other user and all of their records, in every collection
  * societies left with no kept user, plus all records belonging to them
  * child records of deleted parents (ballots/votelogs of deleted elections,
    attendance of deleted daily-help, ...)

SAFE BY DEFAULT: without --execute nothing is changed, it only prints counts.
Take a backup first:   mongodump --uri "$MONGODB_URI" --out backup-$(date +%F)

Usage
  pip install pymongo
  set MONGODB_URI=...   (or leave it in backend/.env)        # default: localhost/mygate
  python scripts/cleanup_inactive_data.py --db mygate        # --db needed if the URI names no database
  python scripts/cleanup_inactive_data.py                    # dry run
  python scripts/cleanup_inactive_data.py --days 10 --execute
  python scripts/cleanup_inactive_data.py --execute --clean-uploads --yes
  python scripts/cleanup_inactive_data.py --db test --admins-only            # keep only admins + super admins
"""
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

try:
    from pymongo import MongoClient
except ImportError:  # pragma: no cover
    sys.exit("pymongo is required:  pip install pymongo")

KEEP_ROLES = ("super_admin",)

# collection -> field(s) naming the user who OWNS the record.
# A record survives only if every listed field that is present points to a kept user.
OWNER = {
    "bookings": ["residentId"],
    "complaints": ["residentId"],
    "dailyhelps": ["addedBy"],
    "deliveries": ["residentId"],
    "elections": ["createdBy"],
    "emergencyalerts": ["userId"],
    "expenses": ["createdBy"],
    "facilitytasks": ["createdBy"],
    "guardavailabilities": ["userId"],
    "guardlocations": ["userId"],
    "guardposts": ["createdBy"],
    "notices": ["createdBy"],
    "notifications": ["userId"],
    "payments": ["residentId"],
    "posts": ["authorId"],
    "serviceproviders": ["userId"],
    "servicerequests": ["residentId"],
    "shifts": ["userId"],
    "societydocuments": ["uploadedBy"],
    "swaprequests": ["requesterId", "targetId"],
    "vehicles": ["residentId"],
    "visitors": ["residentId"],
    "votelogs": ["userId"],
}
# society-level records with no user owner: kept when their society is kept.
SOCIETY_ONLY = ["emergencycontacts"]
# child collection -> (field, parent collection)
CHILD_OF = {
    "ballots": ("electionId", "elections"),
    "votelogs": ("electionId", "elections"),
    "helpattendances": ("helpId", "dailyhelps"),
}
ORDER = sorted(set(OWNER) | set(SOCIETY_ONLY) | set(CHILD_OF))


def ids(coll, query):
    return {d["_id"] for d in coll.find(query, {"_id": 1})}


def plan_admins_only(db, roles):
    """Keep only users with these roles (+ their societies). Everything else goes."""
    users = db["users"]
    kept_users = ids(users, {"role": {"$in": list(roles)}})
    soc = {d["societyId"] for d in users.find({"_id": {"$in": list(kept_users)}, "societyId": {"$ne": None}},
                                              {"societyId": 1}) if d.get("societyId")}
    keep = {"users": kept_users, "societies": soc & ids(db["societies"], {})}
    total = {"users": users.count_documents({}), "societies": db["societies"].count_documents({})}
    for name in ORDER:
        keep[name] = set()
        total[name] = db[name].count_documents({})
    return keep, total


def plan(db, days):
    """Work out, per collection, which _ids survive. Returns (keep, total)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    users = db["users"]
    kept_users = ids(users, {"$or": [{"lastLogin": {"$gte": cutoff}},
                                      {"role": {"$in": list(KEEP_ROLES)}}]})
    all_users = ids(users, {})

    soc_ids = {d["societyId"] for d in users.find(
        {"_id": {"$in": list(kept_users)}, "role": {"$nin": list(KEEP_ROLES)},
         "societyId": {"$ne": None}}, {"societyId": 1}) if d.get("societyId")}
    kept_soc = soc_ids & ids(db["societies"], {})

    keep, total = {}, {}
    keep["users"], total["users"] = kept_users, len(all_users)
    keep["societies"], total["societies"] = kept_soc, db["societies"].count_documents({})

    def decide(name):
        coll = db[name]
        survivors, n = set(), 0
        fields = OWNER.get(name, [])
        for d in coll.find({}, {"_id": 1, "societyId": 1, **{f: 1 for f in fields}}):
            n += 1
            if d.get("societyId") is not None and d["societyId"] not in kept_soc:
                continue
            if any(d.get(f) is not None and d[f] not in kept_users for f in fields):
                continue
            if name in SOCIETY_ONLY and d.get("societyId") is None:
                continue
            survivors.add(d["_id"])
        keep[name], total[name] = survivors, n

    # parents first so children can look at them
    for name in sorted(set(OWNER) | set(SOCIETY_ONLY)):
        decide(name)
    for name, (field, parent) in CHILD_OF.items():
        if name in OWNER:  # votelogs: owner check already done, add parent check
            survivors = {d["_id"] for d in db[name].find({"_id": {"$in": list(keep[name])}},
                                                          {field: 1})
                         if d.get(field) in keep[parent]}
            keep[name] = survivors
        else:
            decide(name)
            keep[name] = {d["_id"] for d in db[name].find({"_id": {"$in": list(keep[name])}},
                                                          {field: 1})
                          if d.get(field) in keep[parent]}
    return keep, total, cutoff


def referenced_uploads(db, collections):
    found = set()

    def walk(v):
        if isinstance(v, str):
            if "uploads/" in v.replace("\\", "/"):
                found.add(v.replace("\\", "/").rsplit("uploads/", 1)[1].split("?")[0])
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, (list, tuple)):
            for x in v:
                walk(x)

    for name in collections:
        for d in db[name].find({}):
            walk(d)
    return found


def env_file_uri():
    """Read MONGODB_URI from backend/.env if present."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", ".env")
    try:
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line.startswith("MONGODB_URI="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--uri", default=None, help="default: $MONGODB_URI, else backend/.env, else localhost")
    ap.add_argument("--db", default=None, help="database name (needed when the URI has none)")
    ap.add_argument("--days", type=int, default=10, help="keep users who logged in within this many days")
    ap.add_argument("--admins-only", action="store_true",
                    help="ignore login dates: keep ONLY admin accounts (and their societies), wipe all other data")
    ap.add_argument("--keep-roles", default="society_admin,super_admin",
                    help="roles kept by --admins-only (comma separated)")
    ap.add_argument("--execute", action="store_true", help="really delete (default is a dry run)")
    ap.add_argument("--yes", action="store_true", help="skip the typed confirmation (for scripts)")
    ap.add_argument("--clean-uploads", action="store_true",
                    help="also delete files in backend/uploads not referenced by surviving records")
    ap.add_argument("--uploads-dir", default=os.path.join(os.path.dirname(__file__), "..", "backend", "uploads"))
    a = ap.parse_args()

    uri = a.uri or os.environ.get("MONGODB_URI") or env_file_uri() or "mongodb://localhost:27017/mygate"
    client = MongoClient(uri)
    try:
        db = client.get_default_database()          # database named inside the URI
    except Exception:
        db = None
    if a.db:
        db = client[a.db]
    if db is None:
        # The URI has no database name. The Node app then uses "test", so never guess:
        # show what exists and ask for --db.
        print("Your MongoDB URI does not name a database. Pick one with --db NAME.\n")
        print("Databases on this server (users = number of user documents):")
        for n in client.list_database_names():
            if n in ("admin", "local", "config"):
                continue
            print(f"  {n:<20} users={client[n]['users'].count_documents({})}")
        print("\nExample:  python scripts/cleanup_inactive_data.py --db <name>")
        return 2
    cutoff = None
    if a.admins_only:
        roles = [r.strip() for r in a.keep_roles.split(",") if r.strip()]
        keep, total = plan_admins_only(db, roles)
    else:
        keep, total, cutoff = plan(db, a.days)

    print(f"Database : {db.name}")
    print(f"Mode     : {'EXECUTE (will delete)' if a.execute else 'DRY RUN (nothing changes)'}")
    if a.admins_only:
        print(f"Keeping ONLY users with role: {', '.join(roles)} (and the societies they belong to)\n")
    else:
        print(f"Keeping users with lastLogin >= {cutoff:%Y-%m-%d %H:%M} UTC, plus {', '.join(KEEP_ROLES)}\n")
    print(f"{'collection':<22}{'total':>8}{'keep':>8}{'delete':>8}")
    print("-" * 46)
    grand = 0
    for name in ["users", "societies"] + ORDER:
        d = total[name] - len(keep[name])
        grand += d
        print(f"{name:<22}{total[name]:>8}{len(keep[name]):>8}{d:>8}")
    print("-" * 46)
    print(f"{'TOTAL TO DELETE':<22}{'':>8}{'':>8}{grand:>8}\n")

    if not a.execute:
        print("Dry run only. Re-run with --execute to delete.")
        return 0
    if grand == 0:
        print("Nothing to delete.")
    elif not a.yes:
        typed = input(f"This permanently deletes {grand} documents from '{db.name}'.\n"
                      f"Type the database name to continue: ")
        if typed.strip() != db.name:
            print("Cancelled.")
            return 1

    for name in ORDER + ["societies", "users"]:
        r = db[name].delete_many({"_id": {"$nin": list(keep[name])}})
        print(f"  deleted {r.deleted_count:>6} from {name}")
    # tidy references to removed users inside surviving societies
    db["societies"].update_many({}, {"$pull": {"admins": {"$nin": list(keep["users"])}}})

    if a.clean_uploads:
        root = os.path.abspath(a.uploads_dir)
        if not os.path.isdir(root):
            print(f"uploads folder not found: {root}")
        else:
            used = referenced_uploads(db, db.list_collection_names())
            removed = 0
            for base, _, files in os.walk(root):
                for f in files:
                    rel = os.path.relpath(os.path.join(base, f), root).replace("\\", "/")
                    if rel not in used and f not in used:
                        os.remove(os.path.join(base, f))
                        removed += 1
            print(f"  removed {removed} unreferenced upload file(s)")
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())