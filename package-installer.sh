#!/bin/bash

#############################################
# Package EditShare Manager for Distribution
#############################################
# Creates a tarball with all files needed
# for installation on target servers
#############################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")
PACKAGE_NAME="editshare-manager-${VERSION}.tar.gz"
TEMP_DIR=$(mktemp -d)

echo "📦 Packaging EditShare Manager v${VERSION}"
echo ""

# Create package directory
PACKAGE_DIR="$TEMP_DIR/editshare-manager"
mkdir -p "$PACKAGE_DIR"

echo "📁 Copying files..."

# Copy application files
rsync -a \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '*.log' \
  --exclude 'dist' \
  --exclude '.DS_Store' \
  --exclude 'coverage' \
  --exclude '.vscode' \
  --exclude 'server/data' \
  "$SCRIPT_DIR/" "$PACKAGE_DIR/"

# Ensure installer is executable
chmod +x "$PACKAGE_DIR/install.sh"

# Create README for the package
cat > "$PACKAGE_DIR/README.txt" <<EOF
EditShare Manager v${VERSION}
=============================

Installation Instructions:

1. Extract this package:
   tar -xzf ${PACKAGE_NAME}
   cd editshare-manager

2. Run the installer as root:
   sudo ./install.sh

3. Follow the interactive wizard

For detailed installation instructions, see INSTALL.md

For configuration and usage information, see DEPLOYMENT.md

EOF

echo "📦 Creating tarball..."
cd "$TEMP_DIR"
tar -czf "$SCRIPT_DIR/$PACKAGE_NAME" editshare-manager/

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Package created: $PACKAGE_NAME"
echo ""
echo "Package size: $(du -h "$SCRIPT_DIR/$PACKAGE_NAME" | cut -f1)"
echo ""
echo "To distribute:"
echo "  1. Copy $PACKAGE_NAME to your target server"
echo "  2. Extract: tar -xzf $PACKAGE_NAME"
echo "  3. Run: cd editshare-manager && sudo ./install.sh"
echo ""
