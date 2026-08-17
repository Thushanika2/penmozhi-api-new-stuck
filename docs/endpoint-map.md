# Endpoint map

The migration keeps the existing method/path contract. `user` means a valid JWT plus completed onboarding; `admin` means a valid JWT with the admin role.

| Area | Preserved endpoints |
| --- | --- |
| Authentication | `POST /api/auth/register`, `/login`, `/logout`, `/refresh`, `/forgot-password`, `/reset-password`; `GET /api/auth/profile`; `PATCH /api/auth/profile`, `/mode`, `/app-lock`; `POST /api/auth/app-lock/verify` |
| Account | `GET /api/account/export`; `DELETE /api/account` |
| Onboarding | `GET /api/onboarding/status`; `POST /api/onboarding/complete` |
| Health | `GET/PUT /api/health-profiles/:id`; `GET /api/health-profiles/:id/risks` |
| Cycles | `POST /api/cycles`; `GET /api/cycles/my`, `/predict-next`, `/insights`, `/calendar`, `/predict-conceive`; `PUT/DELETE /api/cycles/:id` |
| Logs | `GET /api/daily-logs/my`, `/date/:date`; `POST /api/daily-logs`; `PUT/DELETE /api/daily-logs/:id` |
| Symptoms/reminders | `/api/symptoms`, `/api/reminders`, including the original list, trend, mark-taken, snooze, and delete paths |
| Profiles | `/api/pregnancy-profile`, `/api/perimenopause-logs`, `/api/pcos-status`, `/api/tracking-categories`, `/api/custom-tags` |
| Integrations | `/api/push`, `/api/push-subscriptions`, `/api/wearables`, `/api/subscriptions`, `/api/insights` |
| Content | `/api/education`, `/api/education/videos`, `/api/forum` |
| AI | `/api/ai-assistant/chat`, `/recommendations`, `/history`, `/sessions`, `/chats` |
| Sharing | `/api/invitations/*` and `/api/cycle-shares/*` |
| Admin | All original `/admin/*` users, analytics, migration-status, privacy, export, reset, and education-video endpoints |

Responses continue to use the original envelope keys such as `error_code`/`error`, `message_code`/`message`, `user`, `health_profile`, `cycles`, `daily_logs`, and `education_resources`.

