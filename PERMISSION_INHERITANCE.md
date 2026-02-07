# Permission Inheritance System

## Overview

The ES Manager implements a **permission inheritance system** with **user-level overrides** for media space access control. This allows groups to define baseline permissions while individual users can have custom access levels that override their group membership.

---

## How It Works

### 1. **Group Assignment to Space (Inheritance)**

When a group is assigned to a media space:

1. **Group is added** to the space with specified access level (readonly/readwrite)
2. **All group members automatically inherit** that access level
3. **Individual users are added** to the space with the same permission as the group
4. This creates the **baseline permission** for all group members

**Example:**
```
Group "editors" is assigned to space "footage" with readwrite access
→ All users in "editors" group get readwrite access to "footage"
```

### 2. **User-Level Override**

After initial assignment, individual users can have their permissions changed:

1. **User permission is updated** to a different access level
2. **Override is tracked** in the database (`user_permission_overrides` table)
3. **User's custom permission takes precedence** over group inheritance
4. **Group permission changes** will NOT affect users with overrides

**Example:**
```
User "jens" is in "editors" group (readwrite access to "footage")
→ Admin changes jens to readonly access
→ jens now has readonly override (group says readwrite, user override says readonly)
→ If "editors" group permission changes, jens keeps his readonly override
```

### 3. **Priority System**

**Permission Priority (highest to lowest):**
1. **User-level override** (explicit user permission set via API)
2. **Group inheritance** (permission from group membership)

---

## Database Schema

### `user_permission_overrides` Table

Tracks when a user has an explicit permission that differs from group inheritance.

```sql
CREATE TABLE user_permission_overrides (
  space_name TEXT NOT NULL,
  username TEXT NOT NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('readonly', 'readwrite', 'admin')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (space_name, username)
);
```

**Fields:**
- `space_name`: Media space name
- `username`: User who has override
- `access_type`: Override permission level
- `created_at`: When override was created
- `updated_at`: When override was last modified

---

## API Endpoints

### **Add Group to Space** (with inheritance)
```http
POST /api/v1/spaces/:name/groups
Content-Type: application/json

{
  "groupName": "editors",
  "readonly": false
}
```

**Behavior:**
- Adds group to space
- Adds ALL group members to space with same permission
- Does NOT override existing user permissions
- Returns count of users added

**Response:**
```json
{
  "data": {
    "space": "footage",
    "groupName": "editors",
    "usersAdded": 5,
    "message": "Group added to space and members granted access"
  }
}
```

---

### **Change Group Access** (update inheritance)
```http
PUT /api/v1/spaces/:name/groups/:groupName
Content-Type: application/json

{
  "readonly": true,
  "updateUsers": true  // Optional, default: true
}
```

**Behavior:**
- Changes group permission level
- Updates all group members who DON'T have overrides
- Preserves user-level overrides
- If `updateUsers: false`, only updates group, not users

---

### **Set User Access** (create override)
```http
PUT /api/v1/spaces/:name/users/:username
Content-Type: application/json

{
  "readonly": true
}
```

**Behavior:**
- Changes user permission to specified level
- Creates/updates entry in `user_permission_overrides`
- This permission takes precedence over group inheritance

**Response:**
```json
{
  "data": {
    "space": "footage",
    "username": "jens",
    "readonly": true,
    "isOverride": true,
    "message": "User access updated"
  }
}
```

---

### **Get Space Users** (with override indicator)
```http
GET /api/v1/spaces/:name/users
```

**Response:**
```json
{
  "data": [
    {
      "username": "jens",
      "readonly": true,
      "hasOverride": true  // ← Indicates explicit override
    },
    {
      "username": "anna",
      "readonly": false,
      "hasOverride": false  // ← Inherited from group
    }
  ]
}
```

---

### **Get Permission Overrides**
```http
GET /api/v1/spaces/:name/permission-overrides
```

**Response:**
```json
{
  "data": [
    {
      "spaceName": "footage",
      "username": "jens",
      "accessType": "readonly",
      "createdAt": 1675872000,
      "updatedAt": 1675872000
    }
  ]
}
```

---

### **Remove Permission Override**
```http
DELETE /api/v1/spaces/:name/users/:username/override
```

**Behavior:**
- Removes user's explicit override
- User reverts to group-inherited permission
- Does NOT remove user from space

---

## Use Cases

### Use Case 1: Department with Temporary Restricted Access

**Scenario:**
- "post-production" group has readwrite access to "projects" space
- User "contractor" is in "post-production" group
- During sensitive project, contractor needs readonly access only

**Implementation:**
```http
# 1. Group already has readwrite
POST /api/v1/spaces/projects/groups
{ "groupName": "post-production", "readonly": false }

# 2. Override contractor to readonly
PUT /api/v1/spaces/projects/users/contractor
{ "readonly": true }

# 3. When project ends, remove override
DELETE /api/v1/spaces/projects/users/contractor/override
# Contractor now has readwrite again (from group)
```

---

### Use Case 2: Elevated Access for Team Lead

**Scenario:**
- "journalists" group has readonly access to "archive" space
- User "chief-editor" is in "journalists" group
- Chief editor needs readwrite access to organize archive

**Implementation:**
```http
# 1. Group has readonly
POST /api/v1/spaces/archive/groups
{ "groupName": "journalists", "readonly": true }

# 2. Override chief-editor to readwrite
PUT /api/v1/spaces/archive/users/chief-editor
{ "readonly": false }

# Chief editor now has readwrite, other journalists have readonly
```

---

### Use Case 3: Group Permission Change

**Scenario:**
- "editors" group has readwrite access to "daily" space
- Security policy changes: group should now have readonly
- User "lead-editor" should keep readwrite (override)

**Implementation:**
```http
# 1. Lead editor already has override (readwrite)
PUT /api/v1/spaces/daily/users/lead-editor
{ "readonly": false }

# 2. Change group to readonly
PUT /api/v1/spaces/daily/groups/editors
{ "readonly": true, "updateUsers": true }

# Result:
# - Group "editors" now has readonly
# - All editors get readonly EXCEPT lead-editor (has override)
# - Lead editor keeps readwrite access
```

---

## Backend Implementation

### Service: `user-permission-override.store.ts`

**Key Functions:**
- `setUserPermissionOverride(space, user, accessType)` - Create/update override
- `removeUserPermissionOverride(space, user)` - Remove override
- `hasUserPermissionOverride(space, user)` - Check if override exists
- `getUserPermissionOverride(space, user)` - Get override access type
- `getSpacePermissionOverrides(space)` - Get all overrides for space
- `removeSpacePermissionOverrides(space)` - Clean up when space deleted

### Controller: `spaces.controller.ts`

**Enhanced Functions:**
- `addGroupToSpace` - Adds group + inherits permissions to members
- `setGroupAccess` - Updates group + non-overridden members
- `setUserAccess` - Creates user override
- `removeUserFromSpace` - Cleans up override tracking
- `getSpaceUsers` - Enriches with `hasOverride` flag
- `getPermissionOverrides` - Lists all overrides
- `removePermissionOverride` - Reverts to group inheritance

---

## Frontend Display

### Inherited Permission (from group)
```
User: anna
Access: Read/Write
Source: Inherited from "editors" group
```

### Overridden Permission (explicit user setting)
```
User: jens
Access: Read Only (Override)
Source: User-specific setting (overrides "editors" group)
Icon: ⚠️ or 🔒 or custom override indicator
```

---

## Migration

The permission inheritance system is enabled automatically via database migration:

```
server/src/db/migrations/004_user_permission_overrides.sql
```

This migration runs automatically on server startup.

---

## Best Practices

### ✅ **DO:**
- Use group permissions for baseline access control
- Use user overrides sparingly for exceptional cases
- Document why specific users have overrides
- Review overrides periodically

### ❌ **DON'T:**
- Create overrides for every user (defeats purpose of groups)
- Forget to remove temporary overrides when no longer needed
- Use overrides instead of creating proper groups

---

## Testing

### Test Scenario 1: Basic Inheritance
1. Create group "test-group"
2. Add users "user1", "user2" to group
3. Add group to space "test-space" with readonly
4. Verify: Both users have readonly access
5. Change user1 to readwrite
6. Verify: user1 has readwrite (override), user2 still readonly

### Test Scenario 2: Group Change with Override
1. Setup: group has readwrite, user1 has readonly override
2. Change group to readonly
3. Verify: user1 still has readonly override (unchanged)
4. Remove user1 override
5. Verify: user1 now has readonly (inherited from group)

### Test Scenario 3: Cleanup
1. Create space with group and user overrides
2. Delete space
3. Verify: All overrides removed from database

---

## Future Enhancements

- **Audit Log**: Track when overrides are created/removed and by whom
- **Expiring Overrides**: Auto-remove overrides after specified time
- **Override Reasons**: Require reason/justification for overrides
- **Bulk Override Management**: UI for reviewing all overrides across spaces
- **Permission Templates**: Pre-defined override patterns for common scenarios

---

## Summary

The permission inheritance system provides:

✅ **Flexibility**: Groups define baseline, users can have exceptions
✅ **Simplicity**: Most users inherit from groups automatically
✅ **Control**: Administrators can override individual users when needed
✅ **Persistence**: Overrides survive group permission changes
✅ **Cleanup**: Overrides are tracked and can be removed easily

This system balances the convenience of group-based permissions with the flexibility of user-specific overrides.
