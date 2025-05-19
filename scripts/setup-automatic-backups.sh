#!/bin/bash

# Automatic backup setup script for db-tools
# Usage: setup-automatic-backups.sh [options]
# Options:
#   --project <name>       Project name from connect.json (required)
#   --backup-dir <path>    Directory to store backups (default: ./backups)
#   --retention-days <n>   Number of days to keep backups (default: 30)
#   --format <format>      Backup format - 'plain' or 'custom' (default: custom)
#   --encrypt              Encrypt the backup (default: false)
#   --database <name>      Database name to backup (optional)
#   --connect <file>       Path to custom connection file (default: connect.json)
#   --schedule <cron>      Cron schedule (default: "0 0 * * *" - midnight daily)
#   --disable              Remove automatic backups instead of setting them up

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DB_TOOLS_PATH="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
BACKUP_DIR="${DB_TOOLS_PATH}/backups"
RETENTION_DAYS=30
FORMAT="custom"
ENCRYPT=false
PROJECT=""
DATABASE=""
CONNECT_FILE="${DB_TOOLS_PATH}/connect.json"
SCHEDULE="0 0 * * *"  # Daily at midnight
DISABLE=false

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT="$2"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --retention-days)
      RETENTION_DAYS="$2"
      shift 2
      ;;
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --encrypt)
      ENCRYPT=true
      shift
      ;;
    --database)
      DATABASE="$2"
      shift 2
      ;;
    --connect)
      CONNECT_FILE="$2"
      shift 2
      ;;
    --schedule)
      SCHEDULE="$2"
      shift 2
      ;;
    --disable)
      DISABLE=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [ -z "$PROJECT" ]; then
  echo -e "${RED}Error: Project name (--project) is required${NC}"
  exit 1
fi

# Function to detect cron availability and type
detect_cron() {
  if command -v crontab &> /dev/null; then
    echo "standard"
  elif [[ "$OSTYPE" == "darwin"* ]] && command -v launchctl &> /dev/null; then
    echo "launchd"
  else
    echo "none"
  fi
}

# Path to the auto-backup script
AUTO_BACKUP_SCRIPT="${DB_TOOLS_PATH}/scripts/auto-backup.sh"

# Make sure the auto-backup script exists and is executable
if [ ! -f "$AUTO_BACKUP_SCRIPT" ]; then
  echo -e "${RED}Error: auto-backup.sh script not found at $AUTO_BACKUP_SCRIPT${NC}"
  exit 1
fi

chmod +x "$AUTO_BACKUP_SCRIPT"

# Detect cron type
CRON_TYPE=$(detect_cron)

if [ "$CRON_TYPE" == "none" ]; then
  echo -e "${RED}Error: Neither cron nor launchd was found on your system${NC}"
  exit 1
fi

# Build the backup command
BACKUP_CMD="${AUTO_BACKUP_SCRIPT} --project \"${PROJECT}\" --backup-dir \"${BACKUP_DIR}\" --retention-days ${RETENTION_DAYS} --format ${FORMAT} --connect \"${CONNECT_FILE}\""

if [ -n "$DATABASE" ]; then
  BACKUP_CMD="${BACKUP_CMD} --database \"${DATABASE}\""
fi

if [ "$ENCRYPT" = true ]; then
  BACKUP_CMD="${BACKUP_CMD} --encrypt"
fi

# Handle cron setup based on system type
if [ "$CRON_TYPE" == "standard" ]; then
  
  # Get current crontab
  TMPFILE=$(mktemp)
  crontab -l > "$TMPFILE" 2>/dev/null || echo "" > "$TMPFILE"
  
  # Unique comment to identify this backup job
  CRON_MARKER="# DB-TOOLS AUTOMATIC BACKUP FOR PROJECT: ${PROJECT}"
  
  if [ "$DISABLE" = true ]; then
    # Remove existing cron job if found
    grep -v "$CRON_MARKER" "$TMPFILE" > "${TMPFILE}.new"
    mv "${TMPFILE}.new" "$TMPFILE"
    
    echo -e "${BLUE}Removing automatic backup for project ${PROJECT}...${NC}"
    
  else
    # Remove existing job first (if any)
    grep -v "$CRON_MARKER" "$TMPFILE" > "${TMPFILE}.new"
    mv "${TMPFILE}.new" "$TMPFILE"
    
    # Add new job
    echo -e "${BLUE}Setting up automatic backup for project ${PROJECT}...${NC}"
    echo -e "\n$CRON_MARKER" >> "$TMPFILE"
    echo "$SCHEDULE $BACKUP_CMD > /dev/null 2>&1" >> "$TMPFILE"
  fi
  
  # Install new crontab
  crontab "$TMPFILE"
  rm "$TMPFILE"
  
  # Verify cron job installation
  if [ "$DISABLE" = true ]; then
    echo -e "${GREEN}Automatic backup for project ${PROJECT} has been disabled${NC}"
  else
    crontab -l | grep -q "$CRON_MARKER"
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}Automatic backup has been set up successfully${NC}"
      echo "Schedule: $SCHEDULE"
      echo "Command: $BACKUP_CMD"
    else
      echo -e "${RED}Failed to set up automatic backup. Please check your crontab.${NC}"
      exit 1
    fi
  fi
  
elif [ "$CRON_TYPE" == "launchd" ]; then
  # For macOS launchd
  PLIST_LABEL="com.db-tools.autobackup.${PROJECT// /_}"
  PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
  
  if [ "$DISABLE" = true ]; then
    # Remove existing launchd job if it exists
    if [ -f "$PLIST_PATH" ]; then
      echo -e "${BLUE}Removing automatic backup for project ${PROJECT}...${NC}"
      launchctl unload "$PLIST_PATH" 2>/dev/null
      rm "$PLIST_PATH"
      echo -e "${GREEN}Automatic backup for project ${PROJECT} has been disabled${NC}"
    else
      echo -e "${YELLOW}No automatic backup was found for project ${PROJECT}${NC}"
    fi
  else
    # Create the plist file
    mkdir -p "$HOME/Library/LaunchAgents"
    
    # Convert cron schedule to launchd format (basic conversion, might need adjustments for complex schedules)
    # Format: "0 0 * * *" (minute hour day month weekday)
    read -r CRON_MIN CRON_HOUR CRON_DAY CRON_MONTH CRON_WEEKDAY <<< "$SCHEDULE"
    
    echo -e "${BLUE}Setting up automatic backup for project ${PROJECT}...${NC}"
    
    cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>${BACKUP_CMD}</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
EOF

    if [ "$CRON_MIN" != "*" ]; then
      echo "        <key>Minute</key>" >> "$PLIST_PATH"
      echo "        <integer>$CRON_MIN</integer>" >> "$PLIST_PATH"
    fi
    
    if [ "$CRON_HOUR" != "*" ]; then
      echo "        <key>Hour</key>" >> "$PLIST_PATH"
      echo "        <integer>$CRON_HOUR</integer>" >> "$PLIST_PATH"
    fi
    
    if [ "$CRON_DAY" != "*" ]; then
      echo "        <key>Day</key>" >> "$PLIST_PATH"
      echo "        <integer>$CRON_DAY</integer>" >> "$PLIST_PATH"
    fi
    
    if [ "$CRON_MONTH" != "*" ]; then
      echo "        <key>Month</key>" >> "$PLIST_PATH"
      echo "        <integer>$CRON_MONTH</integer>" >> "$PLIST_PATH"
    fi
    
    if [ "$CRON_WEEKDAY" != "*" ]; then
      echo "        <key>Weekday</key>" >> "$PLIST_PATH"
      echo "        <integer>$CRON_WEEKDAY</integer>" >> "$PLIST_PATH"
    fi
    
    cat >> "$PLIST_PATH" << EOF
    </dict>
    <key>StandardErrorPath</key>
    <string>${BACKUP_DIR}/autobackup-${PROJECT// /_}.err</string>
    <key>StandardOutPath</key>
    <string>${BACKUP_DIR}/autobackup-${PROJECT// /_}.log</string>
</dict>
</plist>
EOF
    
    # Load the job
    launchctl load "$PLIST_PATH"
    
    echo -e "${GREEN}Automatic backup has been set up successfully${NC}"
    echo "Schedule: $SCHEDULE"
    echo "Command: $BACKUP_CMD"
    echo "LaunchAgent: $PLIST_PATH"
  fi
fi

# Print summary
if [ "$DISABLE" = false ]; then
  echo -e "\n${BLUE}Automatic Backup Configuration:${NC}"
  echo "Project: $PROJECT"
  if [ -n "$DATABASE" ]; then
    echo "Database: $DATABASE"
  fi
  echo "Backup Directory: $BACKUP_DIR"
  echo "Schedule: $SCHEDULE"
  echo "Retention Period: $RETENTION_DAYS days"
  echo "Format: $FORMAT"
  echo "Encryption: $ENCRYPT"
  
  echo -e "\n${YELLOW}To disable this automatic backup, run:${NC}"
  echo "$0 --project \"$PROJECT\" --disable"
fi