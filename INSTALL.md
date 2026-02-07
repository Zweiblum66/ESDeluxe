# EditShare Manager - Installation Guide

## Quick Start

The EditShare Manager includes an interactive installer that guides you through the entire setup process. No advanced technical knowledge required!

### Prerequisites

- A Linux server (Ubuntu, Debian, RHEL, CentOS, or similar)
- Root or sudo access
- Access to your EditShare environment
- EditShare API credentials
- LDAP credentials

### Installation Steps

1. **Download the installer** to your server:
   ```bash
   # If you have the installation package
   cd /tmp
   tar -xzf editshare-manager.tar.gz
   cd editshare-manager
   ```

2. **Run the installer** as root:
   ```bash
   sudo ./install.sh
   ```

3. **Follow the wizard** - The installer will ask you questions about:
   - EditShare API connection (hostname, port, credentials)
   - LDAP configuration (server, bind DN, password)
   - Application settings (ports, security)
   - Optional nginx configuration

4. **Access the application** when installation completes:
   - Open your web browser
   - Navigate to the URL shown at the end of installation
   - Log in with your EditShare credentials

## What the Installer Does

The installer automatically:

✅ Checks system requirements
✅ Installs Node.js (if needed)
✅ Installs PM2 process manager
✅ Creates installation directory
✅ Installs application dependencies
✅ Builds frontend and backend
✅ Initializes database
✅ Generates secure configuration
✅ Sets up automatic startup
✅ Configures nginx (optional)
✅ Configures firewall (optional)

## Configuration

During installation, you'll be asked for:

### EditShare API Settings
- **Hostname/IP**: The server running EditShare (use `localhost` if installing on the same server)
- **Port**: Usually `8006`
- **Username**: Your EditShare API user (typically `editshare`)
- **Password**: The API user password
- **SSL Verification**: Whether to allow self-signed certificates

### LDAP Settings
- **URI**: LDAP server address (e.g., `ldaps://localhost`)
- **Bind DN**: Admin DN (e.g., `cn=admin,dc=efs,dc=editshare`)
- **Password**: LDAP admin password
- **Base DN**: Search base (e.g., `dc=efs,dc=editshare`)

### Application Settings
- **Backend Port**: API server port (default: `15700`)
- **Web Port**: nginx port for web interface (default: `80`)
- **JWT Expiry**: How long login sessions last (default: `24h`)

## Installation Locations

After installation:

- **Installation Directory**: `/opt/editshare-manager`
- **Configuration File**: `/opt/editshare-manager/.env`
- **Database**: `/opt/editshare-manager/server/data/app.db`
- **Logs**: View with `pm2 logs editshare-manager`

## Post-Installation

### Managing the Service

```bash
# View service status
pm2 status

# Start the service
pm2 start editshare-manager

# Stop the service
pm2 stop editshare-manager

# Restart the service
pm2 restart editshare-manager

# View logs (live)
pm2 logs editshare-manager

# View last 100 log lines
pm2 logs editshare-manager --lines 100
```

### Editing Configuration

If you need to change settings after installation:

```bash
# Edit the configuration file
sudo nano /opt/editshare-manager/.env

# Restart the application to apply changes
pm2 restart editshare-manager
```

### Updating the Application

```bash
# Stop the service
pm2 stop editshare-manager

# Backup your configuration
sudo cp /opt/editshare-manager/.env /opt/editshare-manager/.env.backup

# Extract new version to /opt/editshare-manager

# Restore configuration
sudo cp /opt/editshare-manager/.env.backup /opt/editshare-manager/.env

# Rebuild and restart
cd /opt/editshare-manager
sudo npm run build:all
pm2 restart editshare-manager
```

## Uninstallation

To completely remove EditShare Manager:

```bash
sudo /opt/editshare-manager/uninstall.sh
```

This will:
- Stop the service
- Remove nginx configuration (if configured)
- Delete all installation files
- Remove PM2 configuration

## Troubleshooting

### Installation Fails

**Check system requirements:**
```bash
# Check Node.js version (should be 18+)
node -v

# Check if ports are available
sudo netstat -tlnp | grep -E ':(15700|80)'
```

### Service Won't Start

**Check logs for errors:**
```bash
pm2 logs editshare-manager --err
```

**Common issues:**
- Wrong EditShare API credentials → Check `.env` file
- Port already in use → Change APP_PORT in `.env`
- Database permissions → Check `/opt/editshare-manager/server/data/` permissions

### Can't Connect to Web Interface

**Check if service is running:**
```bash
pm2 status
```

**Check if port is open:**
```bash
sudo netstat -tlnp | grep 15700
```

**Check firewall:**
```bash
# Ubuntu/Debian
sudo ufw status

# RHEL/CentOS
sudo firewall-cmd --list-all
```

### LDAP Connection Errors

**Test LDAP connectivity:**
```bash
# Install ldapsearch if needed
sudo apt-get install ldap-utils  # Ubuntu/Debian
sudo yum install openldap-clients  # RHEL/CentOS

# Test connection
ldapsearch -x -H ldaps://localhost -D "cn=admin,dc=efs,dc=editshare" -W -b "dc=efs,dc=editshare"
```

### EditShare API Connection Errors

**Test API connectivity:**
```bash
# Test if API is reachable
curl -k https://localhost:8006/api/v1/auth/login

# Check if credentials work
curl -k -X POST https://localhost:8006/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"editshare","password":"your-password"}'
```

## Advanced Installation

### Custom Installation Directory

Edit the installer script and change:
```bash
INSTALL_DIR="/your/custom/path"
```

### Running Without nginx

If you don't want to use nginx, the installer will ask. The application can run standalone on the backend port.

### Installing on Non-EditShare Server

The installer detects if you're on an EditShare server. If not, it will configure remote connections automatically.

## Security Notes

- The `.env` file contains sensitive credentials - it's automatically set to `chmod 600`
- Change the default `APP_SECRET` for production use (installer generates a random one)
- Use HTTPS in production (configure nginx with SSL certificates)
- Restrict access to the application ports using firewall rules

## Support

For issues or questions:
1. Check the logs: `pm2 logs editshare-manager`
2. Review this guide
3. Check the main documentation: `/opt/editshare-manager/DEPLOYMENT.md`
