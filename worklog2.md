---
Task ID: 1
Agent: main
Task: Fix project not running + Fix employee search to be client-side filtering

Work Log:
- Dev server was down, restarted it
- Changed employee search from server-side to client-side filtering
- Modified useQuery to fetch ALL employees at once (limit=9999)
- Added useMemo for client-side filtering and pagination
- Search now filters by: employeeId, name, nameAr, position, phone, fingerprintId

Stage Summary:
- Employee search now works client-side without page reload
- All employees are fetched once and filtered locally
