# EditShare New Storage UI — Refined Project Scope

## 1. Project Overview

A web-based management UI for EditShare storage systems, replacing/augmenting the existing EFS Control panel (`https://<server>:8086/msm/`). Built with **Node.js** backend and **Vue 3** frontend, running on **Ubuntu 22 LTS** with direct EFS filesystem access.

### Test Environment
- EditShare server: `192.168.178.191`
- API gateway port: `8006` (HTTPS)
- Existing UI port: `8086` (HTTPS)
- EFS metadata port: `9421`
- EFS storage node port: `9422`
- Admin credentials: configurable (stored in environment config, not hardcoded)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│  Ubuntu 22 LTS Server (Docker)                      │
│                                                     │
│  ┌──────────────┐     ┌──────────────────────────┐  │
│  │  Vue 3 SPA   │────▶│  Node.js Backend (API)   │  │
│  │  (Frontend)  │     │                          │  │
│  │  Port: 8080  │     │  Port: 3000              │  │
│  └──────────────┘     └──────┬───────┬───────────┘  │
│                              │       │              │
│                    ┌─────────┘       └──────────┐   │
│                    ▼                            ▼   │
│  ┌──────────────────────┐  ┌─────────────────────┐  │
│  │  EditShare REST API  │  │  EFS Direct Access   │  │
│  │  (Port 8006 HTTPS)   │  │  (efs-client mount)  │  │
│  │  - Storage API v1    │  │  + CLI tools:         │  │
│  │  - FLOW Admin API v2 │  │    efs-admin          │  │
│  │  - QoS API v1        │  │    efs-setperms       │  │
│  │  - Auth API v1       │  │    efs-getperms       │  │
│  └──────────────────────┘  │    efs-setquota       │  │
│                            │    efs-repquota        │  │
│                            └─────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Network Requirements
- Backend accessible on same or custom subnet as the EditShare server
- GUI served via HTTPS on configurable port
- Direct network access to EditShare API gateway (port 8006)
- Direct network access to EFS metadata server (port 9421) and storage nodes (port 9422)

---

## 3. EFS Client Mounting (Docker Server)

The Node.js backend server needs direct EFS filesystem access for features not available via API.

### Mount Configuration
```bash
efs-client \
  -H 192.168.178.191 \          # EditShare metadata server
  -U <service-user> \            # Dedicated service account
  -S / \                         # Mount root for full access
  --password-file=/etc/efs/.pwd \ # Secure password file (mode 600)
  --log-file=syslog \
  --tls \                        # Enable TLS for auth
  --tls-ca-file=/etc/efs/ca.crt \
  -o allow_other \               # Allow Docker container access
  /mnt/efs                       # Mount point
```

### fstab Entry (for persistent mounting)
```
mount-efs-client /mnt/efs fuse host=192.168.178.191,user=<service-user>,password-file=/etc/efs/.pwd,subfolder=/,tls,tls-ca-file=/etc/efs/ca.crt,allow_other,_netdev
```

### Optimization Settings
| Setting | Value | Purpose |
|---------|-------|---------|
| `--enable-distributed-file-locks` | `yes` | Ensure proper locking across clients |
| `--prefetch-patterns` | As needed per workflow | Pre-fetch sequential files (DPX, image sequences) |
| `--client-symlinks` | `auto` | Default symlink handling |
| `--minimal-file-permissions` | `0660` | Default for new files |
| `--minimal-directory-permissions` | `0770` | Default for new directories |

### Docker Considerations
- Mount EFS on Docker host, bind-mount into container
- Use `--privileged` or appropriate capabilities for FUSE access
- Ensure `fuse` kernel module is loaded on host
- Service user needs to be member of `fuse` group

---

## 4. Feature Modules

### 4.1 User Management

#### Existing UI Analysis (from screenshot)
- Table view with columns: Username, Identity source (local/AD), Maintenance User
- Search bar with text filter
- "Create new User" button (blue, top-right)
- Row selection via checkboxes
- Row click to select/highlight (blue highlight)
- Context menu (three-dot icon) per row
- Count display ("9 Users")
- Sortable by Username column

#### API Coverage — What's Available

| Feature | API Endpoint | Notes |
|---------|-------------|-------|
| List users | `GET /api/v1/storage/users?details=true` | Returns uid, display_name, mail, identity_source, maintenance_spaces |
| Create local user | `POST /api/v1/storage/users` | Body: username + password |
| Delete user | `DELETE /api/v1/storage/users/{username}` | Param: save_media_to_trash |
| Change password | `PUT /api/v1/storage/users/{username}` | LOCAL users only: password field |
| Get user's spaces | `GET /api/v1/storage/users/{username}/spaces` | Includes access_type (since 2025.1.0) |
| Get user's groups | `GET /api/v1/storage/users/{username}/groups` | Group membership list |
| Add user to groups | `POST /api/v1/storage/users/{username}/groups` | Bulk: array of group names |
| Validate credentials | `GET /api/v1/storage/auth` | Returns 200 if valid admin |
| Activate AD user | `POST /api/v1/storage/adsso/user` | Activates AD user in EditShare — **only when AD is active** |
| AD/SSO status | `GET /api/v1/storage/adsso/status` | Sync status — **only when AD is active** |
| Auth backends | `GET /api/v1/auth/settings/backends` | Detect active backends (LOCAL_ES, AD, SSO_SAML, MULTISITE) — **used to conditionally enable AD features in UI** |

#### API Gaps — Needs Direct Filesystem/CLI

| Feature | Gap | Proposed Solution |
|---------|-----|-------------------|
| User rename | No API endpoint | Direct DB access or recreate user |
| Enable/disable user | Storage API has no equivalent | Use FLOW Admin API `PUT /api/v2/admin/users/{id}` with `is_enabled`/`is_suspended` |
| Display name / email update | Read-only in Storage API | Use FLOW Admin API `PUT /api/v2/admin/users/{id}` |
| List available AD users | No discovery endpoint | **Conditional**: Only active when AD integration is enabled. Query AD via LDAP from Node.js |
| Bulk user creation | One-at-a-time only | Implement in backend with sequential API calls |
| Password policy | No API | Implement validation in Node.js backend |
| Force password change | No API | Track in local DB, enforce on next login |

### 4.2 Group Management

#### Existing UI Analysis (from screenshot)
- Table view with columns: Name, In Maintenance Spaces
- Search bar with text filter
- "Create new Group" button (green, top-right)
- Row selection via checkboxes
- Count display ("3 Groups")
- Sortable by Name column
- Current groups: admins, editors, journalists

#### API Coverage — What's Available

| Feature | API Endpoint | Notes |
|---------|-------------|-------|
| List groups | `GET /api/v1/storage/groups?details=true` | Returns identity_source (LOCAL/AD) |
| Create group | `POST /api/v1/storage/groups` | Body: group_name |
| Delete group | `DELETE /api/v1/storage/groups/{group_name}` | Param: save_media_to_trash |
| List group members | `GET /api/v1/storage/groups/{group_name}/users` | Username list |
| Add user to group | `POST /api/v1/storage/groups/{group_name}/users` | Single user |
| Remove user from group | `DELETE /api/v1/storage/groups/{group_name}/users/{username}` | With optional space scope |
| List group spaces | `GET /api/v1/storage/groups/{group_name}/spaces` | Space names |

#### API Gaps — Needs Resolution

| Feature | Gap | Proposed Solution |
|---------|-----|-------------------|
| Group rename | No PUT/PATCH on groups | Delete + recreate (with member migration) |
| Bulk user add (Storage API) | Single user only | Sequential calls or use FLOW Admin API `POST /api/v2/admin/groups/{name}/users` (supports arrays) |
| Group description | Not in Storage API | Use FLOW Admin API (requires description) |
| Group read/write access to spaces | Group access is binary in Storage API | **SOLVED via LDAP**: EditShare uses `<space_name>` (rw) and `_ro_<space_name>` (readonly) LDAP groups internally. Manage membership directly via LDAP |

### 4.3 Media Spaces (Shares)

#### Existing UI Analysis (from screenshot)
- Table with columns: Name, Type (AvidStyle/Unmanaged with colored icons), Maintenance User, Options, Goal, Quota, Used, %Used (with progress bar)
- Search bar + Filter dropdown ("Filter Spaces")
- "Create new Space" button (blue, top-right)
- Row checkboxes for bulk selection
- Count display ("6 spaces")
- Sortable by Name column
- Current spaces: avid demo, avid newsroom, eu footage, footage, jens, newsroom

#### Space Types
- **AvidStyle** (orange "A" icon) — For Avid workflows
- **AvidMXF** — For Avid MXF media
- **Managed** — Managed permissions with maintenance mode
- **Unmanaged** (green lock icon) — Standard file sharing
- **ACL** — Full ACL-based permissions

#### API Coverage — What's Available

| Feature | API Endpoint | Notes |
|---------|-------------|-------|
| List spaces | `GET /api/v1/storage/spaces?details=true&include_users=true` | Full metadata + user permissions |
| Create space | `POST /api/v1/storage/spaces` | Body: SpaceMetadata (name, type, bitbucket, quota, etc.) |
| Update space | `PUT /api/v1/storage/spaces/{space}` | Updatable: space_name, quota, dpx, ewc, public, media_proxies |
| Delete space | `DELETE /api/v1/storage/spaces/{space}` | Param: save_media_to_trash |
| List space users | `GET /api/v1/storage/spaces/{space}/users` | With access_type and readonly status |
| Add user to space | `POST /api/v1/storage/spaces/{space}/users` | Body: username + access_type (readwrite/readonly/admin) |
| Set user access | `PUT /api/v1/storage/spaces/{space}/users/{username}` | Body: access_type enum |
| Remove user | `DELETE /api/v1/storage/spaces/{space}/users/{username}` | Param: save_media_to_trash |
| List space groups | `GET /api/v1/storage/spaces/{space}/groups` | Group names |
| Add group to space | `POST /api/v1/storage/spaces/{space}/groups` | Body: group_name |
| Remove group | `DELETE /api/v1/storage/spaces/{space}/groups/{group_name}` | Param: save_media_to_trash |
| File permissions | `GET/PUT /api/v1/storage/spaces/{space}/files/{path_enc}/permissions` | Unix-style + ACL |
| ACL management | `GET/POST/DELETE /api/v1/storage/spaces/{space}/files/{path_enc}/acl_entries` | Full ACL CRUD |
| Maintenance mode | `PUT/DELETE /api/v1/storage/spaces/{space}/maintenance` | For Managed spaces |
| Storage bitbuckets | `GET /api/v1/storage/bitbuckets` | Available storage locations |
| Storage goals | `GET /api/v1/storage/storage_goals` | Replication goals |
| Trash management | `GET/PUT/DELETE /api/v1/storage/trash` | Restore or permanent delete |

#### API Gaps — Needs Resolution

| Feature | Gap | Proposed Solution |
|---------|-----|-------------------|
| Per-group access levels (readonly/readwrite) | Group access is binary in REST API; no readonly/readwrite for groups | **SOLVED via LDAP**: Add users to `<space_name>` group for rw or `_ro_<space_name>` group for readonly |
| Space usage statistics | Only quota in Storage API | Use `efs-dirinfo` or `efs-repquota` on mounted filesystem for real-time usage |
| Space clone/duplicate | No API | Implement in backend: create space + copy permissions |
| Detailed file browsing | API has basic listing | Use mounted EFS for full file operations |

### 4.4 Quality of Service (QoS) — Bandwidth Management

#### Existing UI Analysis (from screenshot)
- "Enable QoS" toggle at top
- "Add Bandwidth Pool" button
- "Save changes" button (blue, top-right)
- Pools displayed as stacked cards, each containing:
  - Pool name (editable text field)
  - "Limit bandwidth" toggle (green when on)
  - "Bandwidth limit" numeric field with "MiB/s" unit
  - **Consumers** section showing tagged items:
    - Server icon (⟷) for workstations (e.g., "IngestServer")
    - User icon (👤) for users (e.g., "jens")
    - Each consumer has an "×" remove button
  - "Add consumer..." dropdown
  - "Add pool above" (red for first pool) / "Add pool below" / "Delete pool" buttons
- Pool order = priority order (top = highest priority)
- Bottom pool: "All other clients" with "Limit bandwidth" toggle (catch-all)
- Current pools: "live ingest" (500 MiB/s), "jens" (200 MiB/s), "FileTransfer" (50 MiB/s)

#### API Coverage — What's Available

| Feature | API Endpoint | Notes |
|---------|-------------|-------|
| Get QoS config | `GET /api/v1/qos/configuration` | All storage node groups, refreshes every 60s |
| Set QoS config | `PUT /api/v1/qos/configuration/{storage_node_group}` | Full config replacement |
| Get pool assignment | `GET /api/v1/qos/client_pools` | Per-client pool lookup (user, ip, workstation, protocol) |
| Get bandwidth usage | `GET /api/v1/qos/usage` | Real-time per-pool usage in bytes/sec |

#### QoS Configuration Model
```json
{
  "qos_enabled": true,
  "pools": [
    {
      "name": "Pool Name",
      "bandwidth_limit": 524288000,   // bytes/sec (null = unlimited), min 1048576
      "consumers": [
        {"type": "user", "user": "username"},
        {"type": "group", "group": "groupname"},
        {"type": "address", "address": "172.18.1.0/24"},
        {"type": "workstation", "workstation": "hostname"}
      ]
    }
  ],
  "others_bandwidth_limit": null
}
```

#### Consumer Types & Priority Order
1. **Workstation** — hostname match (case-insensitive)
2. **Address** — IPv4, CIDR subnet, or IP range (narrowest wins)
3. **User** — direct user assignment
4. **Group** — group membership

#### API Gaps — Needs Resolution

| Feature | Gap | Proposed Solution |
|---------|-----|-------------------|
| Historical bandwidth data | Only real-time via GET /usage | Implement polling + local time-series DB (SQLite) in backend |
| Per-user bandwidth reporting | Usage is per-pool only | Map users to pools for approximate reporting |
| Scheduled QoS profiles | No time-based rules | Implement cron-based profile switching in Node.js |
| Bandwidth threshold alerts | No notification system | Implement polling + threshold alerting in backend |
| Pool drag-and-drop reorder | N/A (UI feature) | Implement in Vue 3; pool array order = priority |

---

## 5. API Authentication Strategy

The EditShare API supports **HTTP Basic Auth** and **X-EditShare-Token** header.

### Identity Source Detection
The backend should detect available auth backends on startup and adapt the UI accordingly:
```
GET /api/v1/auth/settings/backends → returns configured backends
```
**Identity Sources (AuthTypeChoices):** `LOCAL_ES`, `AD`, `MULTISITE`, `SSO_SAML`

- **AD features** (user import, AD group sync) are **only shown when AD backend is active**
- **Local users** are always available via `LOCAL_ES`
- **OpenLDAP** — **CONFIRMED**: EditShare uses OpenLDAP (`slapd`) as its local user/group backend.
  - **Base DN**: `dc=efs,dc=editshare`
  - **Users OU**: `ou=People,dc=efs,dc=editshare` (posixAccount objects)
  - **Groups OU**: `ou=Groups,dc=efs,dc=editshare` (posixGroup objects with memberUid)
  - **URI**: `ldaps://<hostname>/` (TLS with self-signed cert at `/etc/editshare/ssl/ldap.gnutls.crt`)
  - **Admin bind DN**: `cn=admin,dc=efs,dc=editshare`
  - **Anonymous read** is allowed (ldapsearch -x works without bind credentials)
  - The backend can query LDAP directly for richer user/group data (UIDs, GIDs, full membership)

#### LDAP Internal Group Structure (Important)
EditShare uses a naming convention in LDAP for space-level access control:
- **`<space_name>`** — Read/write access group for a media space (e.g., `footage`, `avid_demo`)
- **`_ro_<space_name>`** — Read-only access group for a media space (e.g., `_ro_footage`, `_ro_avid_demo`)
- **`_esg_<group_name>`** — User-facing groups mapped from the UI (e.g., `_esg_admins`, `_esg_editors`, `_esg_journailsts`)
- **`_efs_privileged`** — Internal EFS privileged access group
- **`_efs_ro_access`** / **`_efs_rw_access`** — Global access control groups
- System/service accounts (prefixed with `_`) should be hidden from the UI

This LDAP structure reveals that **group-level read/write access on spaces IS managed via LDAP groups** — not via the REST API. This is a critical integration point for our application.

### Implementation Plan
```
Node.js Backend
├── Config: EditShare admin credentials (env vars / config file)
├── On startup: validate credentials via GET /api/v1/storage/auth
├── On startup: detect auth backends via GET /api/v1/auth/settings/backends
│   ├── If AD active → enable AD user discovery/import features
│   ├── If OpenLDAP accessible → enable direct LDAP user/group queries
│   └── Always → enable local user management via Storage API
├── All API calls: use HTTP Basic Auth over HTTPS
├── Frontend auth: separate JWT/session auth for UI users
└── TLS: Accept self-signed certs (common in EditShare deployments)
```

### Key API Base URLs
| Service | URL |
|---------|-----|
| Storage | `https://192.168.178.191:8006/api/v1/storage` |
| Auth | `https://192.168.178.191:8006/api/v1/auth` |
| QoS | `https://192.168.178.191:8006/api/v1/qos` |
| FLOW Admin | `https://192.168.178.191:8006/api/v2/admin` |

---

## 6. Direct Filesystem Capabilities (via EFS Mount + CLI Tools)

Features that go beyond what the API provides, leveraging direct EFS access:

| Tool | Capability | Use Case |
|------|-----------|----------|
| `efs-setperms` | Set ACLs with EFS extensions (admin bit, restricted modification, immutable) | Fine-grained group read/write on spaces |
| `efs-getperms` | Read full EFS ACLs including extensions | Display actual permission state |
| `efs-setquota` | Set user/group/project quotas (soft + hard limits, bytes + inodes) | Advanced quota management |
| `efs-repquota` | Report quota usage for all users/groups/projects | Dashboard usage statistics |
| `efs-admin` | Full cluster admin: goals, QoS (iolimits), tokens, sessions, config params | Advanced system management |
| `efs-dirinfo` | Directory size/usage statistics | Space usage reporting |
| `efs-fileinfo` | File chunk/goal information | Storage diagnostics |
| `efs-admin list-mounts` | List all connected clients | Active session monitoring |
| `efs-admin qos-usage` | QoS bandwidth usage per pool | Real-time bandwidth dashboard |
| `efs-admin create-user-token` | Create time-limited mount tokens | Secure token-based auth for clients |

### 6b. OpenLDAP Direct Access

EditShare's OpenLDAP is the source of truth for local users, groups, and space-level access control.

| Operation | LDAP Method | Use Case |
|-----------|------------|----------|
| List all users with UIDs | Search `ou=People` for `posixAccount` | Rich user listing with system IDs |
| List all groups with members | Search `ou=Groups` for `posixGroup` | Full group membership including internal groups |
| Get user's space access (rw/ro) | Check membership in `<space>` and `_ro_<space>` groups | Determine actual access level per space |
| Set group read/write on space | Add user to `<space_name>` group | Grant read/write access |
| Set group read-only on space | Add user to `_ro_<space_name>` group | Grant read-only access |
| Revoke space access | Remove user from both `<space>` and `_ro_<space>` groups | Remove access |
| List UI groups | Filter `_esg_*` prefixed groups | Show user-facing groups (admins, editors, journalists) |

**LDAP Connection Details:**
```
URI:      ldaps://<editshare-host>/
Base DN:  dc=efs,dc=editshare
Bind DN:  cn=admin,dc=efs,dc=editshare
TLS:      Self-signed cert (TLS_REQCERT never)
```

**Important**: System/service accounts and groups (prefixed with `_` except `_esg_*`) should be filtered out of UI displays. User-visible entities:
- **Users**: UIDs >= 131075 (skip system accounts like `_flow`, `_ark`, `geevs`, etc.)
- **UI Groups**: `_esg_*` prefix groups (mapped as `admins`, `editors`, `journalists` in the UI)
- **Space Groups**: `<space_name>` and `_ro_<space_name>` — managed internally, shown as access levels in the Space detail view

---

## 7. UI Design Requirements

### Design System
- **Dark theme** (matching existing EditShare UI — dark navy/charcoal background `#1a1d23`)
- **Accent colors**: Blue (#3b82f6) for primary actions, Green (#22c55e) for create/add, Red (#ef4444) for delete/danger, Orange (#f59e0b) for warnings
- **Left sidebar navigation**: Management section with Users, Groups, Media Spaces, QoS, Trash
- **Icon sidebar**: Left-most column with section icons (Management, Synchronization, System)
- **Top bar**: Server name/label, Language selector, User profile menu

### Page Layouts

#### Users Page
- Search bar (full-width) + "Create new User" button (blue)
- Table: checkbox | Username (sortable) | Identity Source | Maintenance User | Actions (...)
- Row highlight on selection (blue)
- User count display
- Click row → detail panel or edit dialog

#### Groups Page
- Search bar + "Create new Group" button (green)
- Table: checkbox | Name (sortable) | In Maintenance Spaces | Actions (...)
- Group count display

#### Media Spaces Page
- Search bar + Filter dropdown + "Create new Space" button (blue)
- Table: checkbox | Name (sortable) | Type (with colored icon) | Maintenance User | Options | Goal | Quota | Used | %Used (progress bar) | Actions (...)
- Space count display

#### QoS Page
- "Enable QoS" toggle + "Add Bandwidth Pool" button + "Save changes" button
- Stacked pool cards (draggable for reorder):
  - Pool name (editable) | Limit toggle | Bandwidth limit input (MiB/s)
  - Consumers: tagged chips with type icons, removable
  - Add consumer dropdown (users, groups, IPs, workstations)
  - Pool management buttons (add above/below, delete)
- Bottom: "All other clients" catch-all with optional bandwidth limit

---

## 8. Technology Stack

### Backend
- **Runtime**: Node.js 20 LTS
- **Framework**: Express.js or Fastify
- **API Client**: Axios (with HTTPS agent for self-signed certs)
- **Auth**: JWT for frontend sessions; HTTP Basic for EditShare API
- **Database**: SQLite (for local config, session data, bandwidth history)
- **Process Management**: PM2 or Docker
- **LDAP Client**: ldapjs (for OpenLDAP queries/modifications — user/group/space access management)
- **EFS CLI Wrapper**: child_process.execFile for efs-* commands

### Frontend
- **Framework**: Vue 3 (Composition API)
- **Build Tool**: Vite
- **UI Components**: PrimeVue or custom components matching EditShare dark theme
- **State Management**: Pinia
- **HTTP Client**: Axios
- **Drag & Drop**: vuedraggable (for QoS pool reordering)
- **Charts**: Chart.js or ApexCharts (for bandwidth monitoring)

### Infrastructure
- **OS**: Ubuntu 22.04 LTS
- **Container**: Docker + docker-compose
- **EFS Client**: efs-client (FUSE mount on Docker host)
- **Reverse Proxy**: Nginx (HTTPS termination, serving Vue SPA)

---

## 9. Development Phases

### Phase 1: Foundation
- [ ] Project scaffolding (Node.js + Vue 3 + Vite)
- [ ] EditShare API client library with auth handling
- [ ] Docker setup with EFS mount
- [ ] Basic navigation shell matching existing UI design

### Phase 2: User Management
- [ ] User list with search/filter
- [ ] Create/delete users
- [ ] Password management
- [ ] Group membership assignment
- [ ] Media space membership & access levels
- [ ] Identity source display (local/AD)

### Phase 3: Group Management
- [ ] Group list with search
- [ ] Create/delete groups
- [ ] User membership management
- [ ] Media space membership view

### Phase 4: Media Spaces
- [ ] Space list with search/filter by type
- [ ] Create/delete spaces (all types)
- [ ] User access management (readonly/readwrite/admin)
- [ ] Group access management
- [ ] Quota management
- [ ] Usage display with progress bars
- [ ] Trash management

### Phase 5: QoS / Bandwidth Management
- [ ] QoS enable/disable
- [ ] Pool CRUD with drag-and-drop reordering
- [ ] Consumer management (user/group/IP/workstation)
- [ ] Bandwidth limit configuration
- [ ] Real-time bandwidth usage display
- [ ] Historical bandwidth logging

### Phase 6: Advanced Features
- [ ] EFS direct access features (ACL management, advanced quotas)
- [ ] Active session monitoring
- [ ] Bandwidth alerting
- [ ] AD user discovery and activation (conditional — only when AD is active)
- [ ] Bulk operations

---

## 10. Configuration & Security

### Environment Configuration
```env
# EditShare Connection
ES_HOST=192.168.178.191
ES_API_PORT=8006
ES_API_USER=editshare
ES_API_PASSWORD=<configurable>
ES_ALLOW_SELF_SIGNED=true

# EFS Direct Access
EFS_MOUNT_POINT=/mnt/efs
EFS_METADATA_HOST=192.168.178.191
EFS_METADATA_PORT=9421

# Application
APP_PORT=8080
APP_SECRET=<generated-secret>
JWT_EXPIRY=24h

# Network
ALLOWED_SUBNETS=192.168.178.0/24
```

### Security Considerations
- All EditShare API communication over HTTPS
- Admin credentials stored in environment variables (never in code)
- Frontend auth via JWT tokens with configurable expiry
- EFS password file with restricted permissions (mode 600)
- Optional TLS for EFS client authentication
- Subnet-based access restriction for the management UI
