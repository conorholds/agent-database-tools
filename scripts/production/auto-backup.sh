#!/bin/bash

# Auto-backup script for db-tools
# Usage: auto-backup.sh [options]
# Options:
#   --project <name>       Project name from connect.json (required)
#   --backup-dir <path>    Directory to store backups (default: ./backups)
#   --retention-days <n>   Number of days to keep backups (default: 30)
#   --format <format>      Backup format - 'plain' or 'custom' (default: custom)
#   --encrypt              Encrypt the backup (default: false)
#   --database <name>      Database name to backup (optional)
#   --connect <file>       Path to custom connection file (default: connect.json)

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

# Check if db-tools is available
if ! command -v "${DB_TOOLS_PATH}/bin/db-tools.js" &> /dev/null; then
  echo -e "${RED}Error: db-tools not found at ${DB_TOOLS_PATH}/bin/db-tools.js${NC}"
  exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
DB_LABEL="${DATABASE:-default}"
BACKUP_FILENAME="${PROJECT}-${DB_LABEL}-${TIMESTAMP}"

if [ "$FORMAT" == "plain" ]; then
  BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILENAME}.sql"
else
  BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILENAME}.backup"
fi

# Construct the backup command
BACKUP_CMD="${DB_TOOLS_PATH}/bin/db-tools.js backup \"${PROJECT}\" --output \"${BACKUP_FILE}\" --format ${FORMAT} --force --connect \"${CONNECT_FILE}\""

# Add database option if specified
if [ -n "$DATABASE" ]; then
  BACKUP_CMD="${BACKUP_CMD} --database \"${DATABASE}\""
fi

# Add encryption if requested
if [ "$ENCRYPT" = true ]; then
  BACKUP_CMD="${BACKUP_CMD} --encrypt"
fi

# Run the backup
echo -e "${BLUE}Starting automatic backup for project ${PROJECT}...${NC}"
echo "Executing: $BACKUP_CMD"

eval "$BACKUP_CMD"
BACKUP_RESULT=$?

if [ $BACKUP_RESULT -eq 0 ]; then
  echo -e "${GREEN}Backup completed successfully: ${BACKUP_FILE}${NC}"
else
  echo -e "${RED}Backup failed with exit code ${BACKUP_RESULT}${NC}"
  exit $BACKUP_RESULT
fi

# Clean up old backups
echo -e "${BLUE}Cleaning up backups older than ${RETENTION_DAYS} days...${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS uses -mtime +N for N+1 days ago
  find "$BACKUP_DIR" -name "${PROJECT}-*.sql" -o -name "${PROJECT}-*.backup" -mtime +$((RETENTION_DAYS-1)) -delete -print
  find "$BACKUP_DIR" -name "${PROJECT}-*.sql.key" -o -name "${PROJECT}-*.backup.key" -mtime +$((RETENTION_DAYS-1)) -delete -print
else
  # Linux uses -mtime +N for N days ago
  find "$BACKUP_DIR" -name "${PROJECT}-*.sql" -o -name "${PROJECT}-*.backup" -mtime +$RETENTION_DAYS -delete -print
  find "$BACKUP_DIR" -name "${PROJECT}-*.sql.key" -o -name "${PROJECT}-*.backup.key" -mtime +$RETENTION_DAYS -delete -print
fi

echo -e "${GREEN}Automatic backup process completed${NC}"

# Print summary
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "${PROJECT}-*.sql" -o -name "${PROJECT}-*.backup" | wc -l)
echo "Total backups for ${PROJECT}: ${TOTAL_BACKUPS}"
echo "Backup directory: ${BACKUP_DIR}"
echo "Retention period: ${RETENTION_DAYS} days"