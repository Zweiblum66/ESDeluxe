#!/bin/bash

#############################################
# EditShare Manager - Interactive Installer
#############################################
# A wizard-style installer that guides users
# through the deployment process
#############################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Installer configuration
INSTALL_DIR="/opt/editshare-manager"
SERVICE_NAME="editshare-manager"
REQUIRED_NODE_VERSION="18"

# Store configuration values
declare -A CONFIG

#############################################
# Helper Functions
#############################################

print_header() {
    clear
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                                                            ║${NC}"
    echo -e "${BLUE}║         ${GREEN}EditShare Manager Installer${BLUE}                     ║${NC}"
    echo -e "${BLUE}║                                                            ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "\n${BLUE}➤${NC} ${1}"
}

print_success() {
    echo -e "${GREEN}✓${NC} ${1}"
}

print_error() {
    echo -e "${RED}✗${NC} ${1}"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} ${1}"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} ${1}"
}

# Check if dialog is available, fallback to read
HAS_DIALOG=false
if command -v dialog &> /dev/null; then
    HAS_DIALOG=true
fi

# Input function that works with or without dialog
get_input() {
    local prompt="$1"
    local default="$2"
    local result=""

    if [ "$HAS_DIALOG" = true ]; then
        result=$(dialog --stdout --inputbox "$prompt" 0 0 "$default")
    else
        echo -ne "${BLUE}?${NC} ${prompt}"
        if [ -n "$default" ]; then
            echo -ne " [${default}]: "
        else
            echo -ne ": "
        fi
        read -r result
        if [ -z "$result" ] && [ -n "$default" ]; then
            result="$default"
        fi
    fi

    echo "$result"
}

# Password input
get_password() {
    local prompt="$1"
    local result=""

    if [ "$HAS_DIALOG" = true ]; then
        result=$(dialog --stdout --passwordbox "$prompt" 0 0)
    else
        echo -ne "${BLUE}?${NC} ${prompt}: "
        read -rs result
        echo ""
    fi

    echo "$result"
}

# Yes/No prompt
confirm() {
    local prompt="$1"
    local default="${2:-yes}"

    if [ "$HAS_DIALOG" = true ]; then
        if [ "$default" = "yes" ]; then
            dialog --yesno "$prompt" 0 0
        else
            dialog --defaultno --yesno "$prompt" 0 0
        fi
        return $?
    else
        local yn_prompt="[Y/n]"
        [ "$default" = "no" ] && yn_prompt="[y/N]"

        echo -ne "${BLUE}?${NC} ${prompt} ${yn_prompt}: "
        read -r response
        response=${response,,} # to lowercase

        if [ -z "$response" ]; then
            [ "$default" = "yes" ] && return 0 || return 1
        fi

        [[ "$response" =~ ^(yes|y)$ ]] && return 0 || return 1
    fi
}

show_message() {
    local title="$1"
    local message="$2"

    if [ "$HAS_DIALOG" = true ]; then
        dialog --msgbox "$message" 0 0
    else
        echo ""
        echo -e "${GREEN}${title}${NC}"
        echo "$message"
        echo ""
        read -p "Press Enter to continue..."
    fi
}

#############################################
# Pre-installation Checks
#############################################

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This installer must be run as root"
        print_info "Please run: sudo $0"
        exit 1
    fi
}

detect_system() {
    print_step "Detecting system configuration..."

    # Detect if running on EditShare server
    if [ -d "/efs" ] || [ -f "/usr/bin/efs" ]; then
        CONFIG[IS_EDITSHARE_SERVER]="yes"
        print_success "Detected EditShare server"
    else
        CONFIG[IS_EDITSHARE_SERVER]="no"
        print_info "Not running on EditShare server (will use remote connection)"
    fi

    # Detect LDAP
    if systemctl is-active --quiet slapd || systemctl is-active --quiet openldap; then
        CONFIG[LOCAL_LDAP]="yes"
        print_success "Detected local LDAP server"
    else
        CONFIG[LOCAL_LDAP]="no"
    fi

    sleep 1
}

check_dependencies() {
    print_step "Checking dependencies..."

    local missing_deps=()

    # Check for Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -ge "$REQUIRED_NODE_VERSION" ]; then
            print_success "Node.js $(node -v) found"
        else
            print_warning "Node.js version $node_version is too old (need $REQUIRED_NODE_VERSION+)"
            missing_deps+=("nodejs")
        fi
    else
        print_warning "Node.js not found"
        missing_deps+=("nodejs")
    fi

    # Check for npm
    if ! command -v npm &> /dev/null; then
        print_warning "npm not found"
        missing_deps+=("npm")
    else
        print_success "npm $(npm -v) found"
    fi

    # Check for PM2
    if ! command -v pm2 &> /dev/null; then
        print_warning "PM2 not found (will install)"
        CONFIG[INSTALL_PM2]="yes"
    else
        print_success "PM2 found"
        CONFIG[INSTALL_PM2]="no"
    fi

    # Check for nginx (optional)
    if command -v nginx &> /dev/null; then
        print_success "nginx found"
        CONFIG[HAS_NGINX]="yes"
    else
        print_info "nginx not found (optional)"
        CONFIG[HAS_NGINX]="no"
    fi

    CONFIG[MISSING_DEPS]="${missing_deps[@]}"
}

install_dependencies() {
    if [ -n "${CONFIG[MISSING_DEPS]}" ]; then
        print_step "Installing missing dependencies..."

        # Detect package manager
        if command -v apt-get &> /dev/null; then
            print_info "Using apt package manager"
            apt-get update
            apt-get install -y curl

            # Install Node.js from NodeSource
            curl -fsSL https://deb.nodesource.com/setup_${REQUIRED_NODE_VERSION}.x | bash -
            apt-get install -y nodejs
        elif command -v yum &> /dev/null; then
            print_info "Using yum package manager"
            curl -fsSL https://rpm.nodesource.com/setup_${REQUIRED_NODE_VERSION}.x | bash -
            yum install -y nodejs
        else
            print_error "Unsupported package manager"
            print_info "Please install Node.js ${REQUIRED_NODE_VERSION}+ manually"
            exit 1
        fi

        print_success "Dependencies installed"
    fi

    # Install PM2 if needed
    if [ "${CONFIG[INSTALL_PM2]}" = "yes" ]; then
        print_step "Installing PM2..."
        npm install -g pm2
        pm2 startup systemd -u root --hp /root
        print_success "PM2 installed and configured"
    fi
}

#############################################
# Configuration Wizard
#############################################

welcome_screen() {
    print_header
    echo "Welcome to the EditShare Manager installer!"
    echo ""
    echo "This wizard will guide you through the installation process."
    echo "You will be asked a few questions about your EditShare environment."
    echo ""
    echo -e "${YELLOW}What you'll need:${NC}"
    echo "  • EditShare API credentials"
    echo "  • LDAP connection details"
    echo "  • Network ports for the application"
    echo ""

    if ! confirm "Ready to begin installation?"; then
        echo "Installation cancelled."
        exit 0
    fi
}

gather_editshare_config() {
    print_header
    echo -e "${GREEN}Step 1: EditShare API Configuration${NC}"
    echo ""

    # EditShare host
    local default_host="localhost"
    if [ "${CONFIG[IS_EDITSHARE_SERVER]}" = "no" ]; then
        default_host=""
    fi

    CONFIG[ES_HOST]=$(get_input "EditShare server hostname or IP" "$default_host")

    # EditShare API port
    CONFIG[ES_API_PORT]=$(get_input "EditShare API port" "8006")

    # EditShare API credentials
    CONFIG[ES_API_USER]=$(get_input "EditShare API username" "editshare")
    CONFIG[ES_API_PASSWORD]=$(get_password "EditShare API password")

    # SSL verification
    if confirm "Allow self-signed SSL certificates?"; then
        CONFIG[ES_ALLOW_SELF_SIGNED]="true"
    else
        CONFIG[ES_ALLOW_SELF_SIGNED]="false"
    fi
}

gather_ldap_config() {
    print_header
    echo -e "${GREEN}Step 2: LDAP Configuration${NC}"
    echo ""

    # LDAP URI
    local default_uri="ldaps://localhost"
    if [ "${CONFIG[LOCAL_LDAP]}" = "no" ]; then
        default_uri="ldaps://${CONFIG[ES_HOST]}"
    fi

    CONFIG[LDAP_URI]=$(get_input "LDAP server URI" "$default_uri")

    # LDAP bind DN
    CONFIG[LDAP_BIND_DN]=$(get_input "LDAP bind DN" "cn=admin,dc=efs,dc=editshare")

    # LDAP password
    CONFIG[LDAP_BIND_PASSWORD]=$(get_password "LDAP bind password")

    # LDAP base DN
    CONFIG[LDAP_BASE_DN]=$(get_input "LDAP base DN" "dc=efs,dc=editshare")

    # SSL verification
    if confirm "Reject unauthorized LDAP certificates?" "no"; then
        CONFIG[LDAP_REJECT_UNAUTHORIZED]="true"
    else
        CONFIG[LDAP_REJECT_UNAUTHORIZED]="false"
    fi
}

gather_app_config() {
    print_header
    echo -e "${GREEN}Step 3: Application Configuration${NC}"
    echo ""

    # Application port
    CONFIG[APP_PORT]=$(get_input "Application backend port" "15700")

    # Generate random secret
    local random_secret=$(openssl rand -hex 32 2>/dev/null || head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32)
    CONFIG[APP_SECRET]="$random_secret"
    print_info "Generated secure application secret"

    # JWT expiry
    CONFIG[JWT_EXPIRY]=$(get_input "JWT token expiry (e.g., 24h, 7d)" "24h")

    # Nginx port (if available)
    if [ "${CONFIG[HAS_NGINX]}" = "yes" ]; then
        if confirm "Configure nginx reverse proxy?"; then
            CONFIG[NGINX_PORT]=$(get_input "Nginx port for web interface" "80")
            CONFIG[USE_NGINX]="yes"
        else
            CONFIG[USE_NGINX]="no"
        fi
    else
        CONFIG[USE_NGINX]="no"
    fi
}

gather_efs_config() {
    if [ "${CONFIG[IS_EDITSHARE_SERVER]}" = "yes" ]; then
        print_header
        echo -e "${GREEN}Step 4: EFS Configuration (Optional)${NC}"
        echo ""

        if confirm "Configure direct EFS access?" "no"; then
            CONFIG[EFS_MOUNT_POINT]=$(get_input "EFS mount point" "/efs/efs_1")
            CONFIG[EFS_METADATA_HOST]=$(get_input "EFS metadata host" "localhost")
            CONFIG[EFS_METADATA_PORT]=$(get_input "EFS metadata port" "9421")
        fi
    fi
}

review_configuration() {
    print_header
    echo -e "${GREEN}Configuration Review${NC}"
    echo ""
    echo "Please review your configuration:"
    echo ""
    echo -e "${BLUE}EditShare API:${NC}"
    echo "  Host: ${CONFIG[ES_HOST]}"
    echo "  Port: ${CONFIG[ES_API_PORT]}"
    echo "  User: ${CONFIG[ES_API_USER]}"
    echo ""
    echo -e "${BLUE}LDAP:${NC}"
    echo "  URI: ${CONFIG[LDAP_URI]}"
    echo "  Bind DN: ${CONFIG[LDAP_BIND_DN]}"
    echo "  Base DN: ${CONFIG[LDAP_BASE_DN]}"
    echo ""
    echo -e "${BLUE}Application:${NC}"
    echo "  Backend Port: ${CONFIG[APP_PORT]}"
    echo "  JWT Expiry: ${CONFIG[JWT_EXPIRY]}"
    if [ "${CONFIG[USE_NGINX]}" = "yes" ]; then
        echo "  Web Port: ${CONFIG[NGINX_PORT]} (via nginx)"
    fi
    echo ""

    if ! confirm "Is this configuration correct?"; then
        echo ""
        echo "Please restart the installer to reconfigure."
        exit 0
    fi
}

#############################################
# Installation
#############################################

create_install_directory() {
    print_step "Creating installation directory..."

    if [ -d "$INSTALL_DIR" ]; then
        if confirm "Installation directory exists. Overwrite?" "no"; then
            rm -rf "$INSTALL_DIR"
        else
            print_error "Installation cancelled"
            exit 1
        fi
    fi

    mkdir -p "$INSTALL_DIR"
    print_success "Created $INSTALL_DIR"
}

copy_files() {
    print_step "Copying application files..."

    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # Copy all files except node_modules
    rsync -a --exclude 'node_modules' --exclude '.git' --exclude '*.log' \
          "$script_dir/" "$INSTALL_DIR/"

    print_success "Files copied"
}

create_env_file() {
    print_step "Creating environment configuration..."

    cat > "$INSTALL_DIR/.env" <<EOF
# ===========================================
# EditShare Manager - Environment Configuration
# ===========================================
# Generated by installer on $(date)

# --- EditShare API Connection ---
ES_HOST=${CONFIG[ES_HOST]}
ES_API_PORT=${CONFIG[ES_API_PORT]}
ES_API_USER=${CONFIG[ES_API_USER]}
ES_API_PASSWORD=${CONFIG[ES_API_PASSWORD]}
ES_ALLOW_SELF_SIGNED=${CONFIG[ES_ALLOW_SELF_SIGNED]}

# --- LDAP Connection ---
LDAP_URI=${CONFIG[LDAP_URI]}
LDAP_BIND_DN=${CONFIG[LDAP_BIND_DN]}
LDAP_BIND_PASSWORD=${CONFIG[LDAP_BIND_PASSWORD]}
LDAP_BASE_DN=${CONFIG[LDAP_BASE_DN]}
LDAP_REJECT_UNAUTHORIZED=${CONFIG[LDAP_REJECT_UNAUTHORIZED]}

# --- EFS Direct Access ---
EFS_MOUNT_POINT=${CONFIG[EFS_MOUNT_POINT]:-}
EFS_METADATA_HOST=${CONFIG[EFS_METADATA_HOST]:-}
EFS_METADATA_PORT=${CONFIG[EFS_METADATA_PORT]:-}

# --- Application ---
APP_PORT=${CONFIG[APP_PORT]}
APP_SECRET=${CONFIG[APP_SECRET]}
JWT_EXPIRY=${CONFIG[JWT_EXPIRY]}

# --- Nginx ---
NGINX_PORT=${CONFIG[NGINX_PORT]:-80}

# --- Frontend ---
VITE_DEV_PORT=15720
VITE_API_BASE_URL=http://localhost:${CONFIG[APP_PORT]}
EOF

    chmod 600 "$INSTALL_DIR/.env"
    print_success "Environment file created"
}

install_packages() {
    print_step "Installing application dependencies..."
    echo "This may take a few minutes..."

    cd "$INSTALL_DIR"

    # Install root dependencies
    npm install --production > /dev/null 2>&1

    # Build shared types
    cd "$INSTALL_DIR/shared"
    npm install --production > /dev/null 2>&1
    npm run build > /dev/null 2>&1

    # Install and build server
    cd "$INSTALL_DIR/server"
    npm install --production > /dev/null 2>&1
    npm run build > /dev/null 2>&1

    # Install and build client
    cd "$INSTALL_DIR/client"
    npm install > /dev/null 2>&1
    VITE_API_BASE_URL="http://localhost:${CONFIG[APP_PORT]}" npm run build > /dev/null 2>&1

    print_success "Dependencies installed and application built"
}

setup_database() {
    print_step "Initializing database..."

    cd "$INSTALL_DIR/server"

    # Run migrations
    node -e "
        const { initializeDatabase } = require('./dist/db');
        initializeDatabase().then(() => {
            console.log('Database initialized');
            process.exit(0);
        }).catch(err => {
            console.error('Database error:', err);
            process.exit(1);
        });
    "

    print_success "Database initialized"
}

configure_pm2() {
    print_step "Configuring PM2 process manager..."

    cd "$INSTALL_DIR"

    # Start application with PM2
    pm2 delete $SERVICE_NAME 2>/dev/null || true
    pm2 start ecosystem.config.cjs
    pm2 save

    print_success "PM2 configured"
}

configure_nginx() {
    if [ "${CONFIG[USE_NGINX]}" = "yes" ]; then
        print_step "Configuring nginx..."

        # Create nginx configuration
        cat > "/etc/nginx/sites-available/editshare-manager" <<EOF
server {
    listen ${CONFIG[NGINX_PORT]};
    server_name _;

    # Frontend
    location / {
        root $INSTALL_DIR/client/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # API
    location /api/ {
        proxy_pass http://localhost:${CONFIG[APP_PORT]};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

        # Enable site
        ln -sf /etc/nginx/sites-available/editshare-manager /etc/nginx/sites-enabled/

        # Test and reload nginx
        nginx -t && systemctl reload nginx

        print_success "nginx configured"
    fi
}

setup_firewall() {
    if command -v ufw &> /dev/null; then
        if confirm "Configure firewall (ufw) to allow access?" "no"; then
            print_step "Configuring firewall..."

            ufw allow ${CONFIG[APP_PORT]}/tcp comment "EditShare Manager API"

            if [ "${CONFIG[USE_NGINX]}" = "yes" ]; then
                ufw allow ${CONFIG[NGINX_PORT]}/tcp comment "EditShare Manager Web"
            fi

            print_success "Firewall configured"
        fi
    fi
}

#############################################
# Post-installation
#############################################

show_completion() {
    print_header
    echo -e "${GREEN}Installation Complete!${NC}"
    echo ""
    echo "EditShare Manager has been successfully installed."
    echo ""
    echo -e "${BLUE}Access Information:${NC}"

    if [ "${CONFIG[USE_NGINX]}" = "yes" ]; then
        echo "  Web Interface: http://$(hostname -I | awk '{print $1}'):${CONFIG[NGINX_PORT]}"
    else
        echo "  Web Interface: http://$(hostname -I | awk '{print $1}'):${CONFIG[APP_PORT]}"
    fi

    echo "  API Endpoint: http://$(hostname -I | awk '{print $1}'):${CONFIG[APP_PORT]}/api"
    echo ""
    echo -e "${BLUE}Management Commands:${NC}"
    echo "  Start service:   pm2 start $SERVICE_NAME"
    echo "  Stop service:    pm2 stop $SERVICE_NAME"
    echo "  Restart service: pm2 restart $SERVICE_NAME"
    echo "  View logs:       pm2 logs $SERVICE_NAME"
    echo "  Service status:  pm2 status"
    echo ""
    echo -e "${BLUE}Configuration:${NC}"
    echo "  Install directory: $INSTALL_DIR"
    echo "  Config file: $INSTALL_DIR/.env"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Open the web interface in your browser"
    echo "  2. Log in with your EditShare credentials"
    echo "  3. Start managing your EditShare environment!"
    echo ""
    echo "For support, check the documentation at $INSTALL_DIR/DEPLOYMENT.md"
    echo ""
}

create_uninstaller() {
    cat > "$INSTALL_DIR/uninstall.sh" <<'EOF'
#!/bin/bash
# EditShare Manager Uninstaller

echo "This will completely remove EditShare Manager from your system."
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Uninstall cancelled."
    exit 0
fi

echo "Stopping service..."
pm2 delete editshare-manager 2>/dev/null || true
pm2 save

if [ -f /etc/nginx/sites-enabled/editshare-manager ]; then
    echo "Removing nginx configuration..."
    rm -f /etc/nginx/sites-enabled/editshare-manager
    rm -f /etc/nginx/sites-available/editshare-manager
    systemctl reload nginx
fi

echo "Removing installation directory..."
rm -rf /opt/editshare-manager

echo "EditShare Manager has been uninstalled."
EOF

    chmod +x "$INSTALL_DIR/uninstall.sh"
}

#############################################
# Main Installation Flow
#############################################

main() {
    # Pre-installation
    check_root
    detect_system
    check_dependencies

    # Interactive wizard
    welcome_screen
    gather_editshare_config
    gather_ldap_config
    gather_app_config
    gather_efs_config
    review_configuration

    # Install dependencies
    install_dependencies

    # Installation
    create_install_directory
    copy_files
    create_env_file
    install_packages
    setup_database
    configure_pm2
    configure_nginx
    setup_firewall
    create_uninstaller

    # Completion
    show_completion
}

# Run main installation
main
