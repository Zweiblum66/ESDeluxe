# EditShare Manager - Deployment Guide

## Architecture Overview

The ES Manager application is deployed **directly on the EditShare server** (192.168.178.191) to access:
- Native EFS CLI tools (`efs-admin`, `efs-setperms`, etc.)
- EditShare REST API on `localhost:8006`
- OpenLDAP server on `localhost`
- Direct EFS filesystem access

### Deployment Model
- **Build**: On your local Mac (Node.js + TypeScript compilation)
- **Deploy**: SSH/SCP to EditShare server
- **Runtime**: PM2 process manager on Ubuntu 22.04 LTS
- **Server**: Express serves both API and static frontend on port **15700**

---

## Server Configuration

### EditShare Server Details
- **Host**: `192.168.178.191`
- **User**: `editshare`
- **Password**: `changeme0479`
- **App Directory**: `/home/editshare/es-manager/`

### Application Ports
- **15700**: ES Manager (API + Frontend)
- **15710**: Reserved for Nginx (optional)
- **8006**: EditShare API (HTTPS, localhost only)
- **9421**: EFS metadata server
- **9422**: EFS storage nodes

### Environment Configuration

The `.env` file is deployed to the server with these settings:

```env
# EditShare API (localhost on the ES server)
ES_HOST=localhost
ES_API_PORT=8006
ES_API_USER=editshare
ES_API_PASSWORD=changeme0479
ES_ALLOW_SELF_SIGNED=true

# LDAP (localhost on the ES server)
LDAP_URI=ldaps://localhost
LDAP_BIND_DN=cn=admin,dc=efs,dc=editshare
LDAP_BIND_PASSWORD=<ldap-admin-password>
LDAP_BASE_DN=dc=efs,dc=editshare
LDAP_REJECT_UNAUTHORIZED=false

# EFS Direct Access
EFS_MOUNT_POINT=/efs/efs_1
EFS_METADATA_HOST=localhost
EFS_METADATA_PORT=9421

# Application
APP_PORT=15700
APP_SECRET=<generate-random-secret>
JWT_EXPIRY=24h
```

---

## Deployment Workflow

### Prerequisites

**On your Mac:**
- Node.js 20 LTS
- `sshpass` for automated SSH: `brew install sshpass`

**On EditShare Server (one-time setup):**
```bash
./deploy.sh --setup
```
This installs PM2 globally and configures it for the editshare user.

### Standard Deployment

**Full deployment (build + deploy):**
```bash
./deploy.sh
```

**Deploy without rebuilding:**
```bash
./deploy.sh --skip-build
```

### Deployment Steps (Automated)

1. **Build Phase** (local Mac):
   - Compiles server TypeScript → `server/dist/`
   - Builds frontend Vue 3 app → `client/dist/`
   - Compiles shared types → `shared/dist/`

2. **Package Phase** (local Mac):
   - Creates deployment tarball with:
     - Server compiled JS + dependencies
     - Frontend static files
     - `.env` configuration
     - PM2 config (`ecosystem.config.cjs`)

3. **Deploy Phase** (to EditShare server):
   - Uploads tarball via SCP
   - Extracts to `/home/editshare/es-manager/`
   - Installs production dependencies
   - Restarts via PM2

4. **Health Check**:
   - Waits for server startup
   - Checks `http://localhost:15700/api/v1/system/health`

---

## Post-Deployment Management

### Check Application Status
```bash
./deploy.sh --status
```

Runs `pm2 status` on the server.

### View Live Logs
```bash
./deploy.sh --logs
```

Tails PM2 logs in real-time.

### Manual SSH Access
```bash
sshpass -p 'changeme0479' ssh editshare@192.168.178.191
cd /home/editshare/es-manager
pm2 status
pm2 logs es-manager
pm2 restart es-manager
```

---

## Accessing the Application

### From Network Clients
```
http://192.168.178.191:15700
```

### From EditShare Server (localhost)
```
http://localhost:15700
```

### API Endpoints
- **Health**: `http://192.168.178.191:15700/api/v1/system/health`
- **Auth**: `http://192.168.178.191:15700/api/v1/auth/login`
- **Users**: `http://192.168.178.191:15700/api/v1/users`
- **Groups**: `http://192.168.178.191:15700/api/v1/groups`
- **Spaces**: `http://192.168.178.191:15700/api/v1/spaces`
- **QoS**: `http://192.168.178.191:15700/api/v1/qos/config`

---

## Troubleshooting

### Application Won't Start
```bash
ssh editshare@192.168.178.191
cd /home/editshare/es-manager
pm2 logs es-manager --lines 50
```

Common issues:
- **Port 15700 in use**: Check with `lsof -i :15700`, kill process if needed
- **Missing .env**: Ensure `.env` file exists in `/home/editshare/es-manager/`
- **LDAP connection failed**: Check LDAP password in `.env`
- **EditShare API unavailable**: Verify ES API is running on port 8006

### Cannot Connect to QoS Endpoints
- Verify QoS is enabled on EditShare server
- Check EditShare API logs: `/var/log/editshare/`
- Test QoS API directly: `curl -k -u editshare:changeme0479 https://localhost:8006/api/v1/qos/configuration`

### Frontend Not Loading
- Check Express is serving static files: `curl http://localhost:15700/`
- Verify `client/dist/` was deployed correctly
- Check PM2 logs for startup errors

### Build Failures
```bash
# Clear node_modules and rebuild
rm -rf node_modules */node_modules
npm install
npm run build
```

---

## PM2 Configuration

The application runs via PM2 using `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: 'es-manager',
    cwd: '/home/editshare/es-manager/server',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: '../logs/error.log',
    out_file: '../logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    autorestart: true
  }]
}
```

### PM2 Commands (on server)
```bash
pm2 start ecosystem.config.cjs --env production
pm2 restart es-manager
pm2 stop es-manager
pm2 logs es-manager
pm2 monit
pm2 save  # Save current process list
pm2 startup  # Configure PM2 to start on boot
```

---

## Security Considerations

### Network Access
- Application binds to `0.0.0.0:15700` (accessible from network)
- EditShare API on `localhost:8006` (not exposed)
- LDAP on `localhost` (not exposed)

### Credentials
- EditShare API credentials in `.env` (file permissions: 600)
- LDAP admin password in `.env`
- JWT secret for session management

### Firewall
Consider restricting access to port 15700:
```bash
sudo ufw allow from 192.168.178.0/24 to any port 15700
```

---

## Backup & Recovery

### Application State
The application is stateless. All data resides in:
- EditShare native storage (users, groups, spaces)
- QoS configurations (EditShare API)
- EFS filesystem

### Configuration Backup
```bash
ssh editshare@192.168.178.191
cd /home/editshare/es-manager
tar czf ~/es-manager-backup-$(date +%Y%m%d).tar.gz .env ecosystem.config.cjs
```

---

## Monitoring

### Health Check Endpoint
```bash
curl http://192.168.178.191:15700/api/v1/system/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-06T12:00:00Z",
  "uptime": 3600,
  "version": "0.1.0"
}
```

### Log Files
- **PM2 logs**: `/home/editshare/es-manager/logs/`
- **EditShare logs**: `/var/log/editshare/`
- **Systemd journal**: `journalctl -u pm2-editshare`

---

## Rollback Procedure

If deployment fails:

1. **SSH to server**:
   ```bash
   ssh editshare@192.168.178.191
   ```

2. **Restore previous version** (if backed up):
   ```bash
   cd /home/editshare
   rm -rf es-manager
   tar xzf es-manager-backup-YYYYMMDD.tar.gz
   ```

3. **Restart PM2**:
   ```bash
   cd es-manager
   pm2 restart ecosystem.config.cjs --env production
   ```

---

## Development vs Production

### Local Development
- Backend: `npm run dev -w server` (port 15700)
- Frontend: `npm run dev -w client` (port 15720, Vite dev server)
- Access: `http://localhost:15720` (with API proxy to :15700)

### Production (EditShare Server)
- Single port: 15700
- Express serves both API and frontend static files
- No Vite dev server, no hot-reload
- PM2 manages the process

---

## Next Steps After Deployment

1. **Configure LDAP password** in `.env`
2. **Generate secure JWT secret** in `.env`
3. **Test all features**:
   - Login with EditShare credentials
   - View users, groups, spaces
   - Enable QoS and create bandwidth pools
4. **Set up firewall rules** (optional)
5. **Configure PM2 startup**: `pm2 startup` (run as editshare user)
6. **Schedule backups** of `.env` file

---

## Support

For issues or questions:
1. Check logs: `./deploy.sh --logs`
2. Check PM2 status: `./deploy.sh --status`
3. Test health endpoint: `curl http://192.168.178.191:15700/api/v1/system/health`
4. Review EditShare API docs: https://developers.editshare.com
