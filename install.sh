#!/bin/bash

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Target PostgreSQL version - set this to match your server
PG_TARGET_VERSION="16"

echo -e "${BLUE}DB Tools Installer${NC}"
echo "================="
echo "This script will install PostgreSQL $PG_TARGET_VERSION client tools and set up DB Tools."
echo ""

# Function to check if a command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Function to extract the major version from version string
get_pg_version() {
  local version_str=$1
  # Extract first number sequence
  echo "$version_str" | grep -o -E '[0-9]+' | head -1
}

# Function to compare version numbers
version_lt() {
  [ "$1" -lt "$2" ]
}

# Check for PostgreSQL tools
check_pg_tools() {
  local missing_tools=()
  local all_installed=true
  local need_upgrade=false
  local client_version=0

  echo -e "${BLUE}Checking for PostgreSQL client tools...${NC}"
  
  for tool in pg_dump pg_restore psql; do
    if ! command_exists "$tool"; then
      echo -e "${RED}✗ $tool not found${NC}"
      missing_tools+=("$tool")
      all_installed=false
    else
      echo -e "${GREEN}✓ $tool is available${NC}"
      
      # Get client version
      if [ "$tool" = "psql" ]; then
        client_version_str=$($tool --version 2>/dev/null)
        client_version=$(get_pg_version "$client_version_str")
        echo "   Client version: $client_version"
      fi
    fi
  done
  
  # Check if we need to install or upgrade
  if [ "$all_installed" = false ] || [ "$client_version" != "$PG_TARGET_VERSION" ]; then
    if [ "$all_installed" = false ]; then
      echo -e "${YELLOW}Need to install PostgreSQL $PG_TARGET_VERSION client tools${NC}"
    else
      echo -e "${YELLOW}Need to upgrade to PostgreSQL $PG_TARGET_VERSION client tools${NC}"
    fi
    
    # Install PostgreSQL client tools
    echo ""
    echo -e "${BLUE}Installing PostgreSQL $PG_TARGET_VERSION client tools...${NC}"
    
    # Detect OS and install PostgreSQL tools
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS
      if command_exists brew; then
        echo "Installing PostgreSQL $PG_TARGET_VERSION via Homebrew..."
        
        # Check if already installed
        if brew ls --versions postgresql@$PG_TARGET_VERSION > /dev/null; then
          echo "PostgreSQL $PG_TARGET_VERSION is already installed"
        else
          echo "Installing PostgreSQL $PG_TARGET_VERSION..."
          brew install postgresql@$PG_TARGET_VERSION
        fi
        
        # Get the location of the installed binaries
        PG_PATH=$(brew --prefix postgresql@$PG_TARGET_VERSION)/bin
        
        if [ -d "$PG_PATH" ]; then
          # Add to PATH for this session
          export PATH="$PG_PATH:$PATH"
          
          # Add to shell profile for future sessions
          SHELL_PROFILE=""
          if [ -f "$HOME/.zshrc" ]; then
            SHELL_PROFILE="$HOME/.zshrc"
          elif [ -f "$HOME/.bash_profile" ]; then
            SHELL_PROFILE="$HOME/.bash_profile"
          elif [ -f "$HOME/.bashrc" ]; then
            SHELL_PROFILE="$HOME/.bashrc"
          fi
          
          if [ -n "$SHELL_PROFILE" ]; then
            # Check if it's already in the profile
            if ! grep -q "$PG_PATH" "$SHELL_PROFILE"; then
              echo ""
              echo "Adding PostgreSQL $PG_TARGET_VERSION to your PATH in $SHELL_PROFILE"
              echo ""
              echo "# PostgreSQL $PG_TARGET_VERSION path" >> "$SHELL_PROFILE"
              echo "export PATH=\"$PG_PATH:\$PATH\"" >> "$SHELL_PROFILE"
              echo "To use PostgreSQL $PG_TARGET_VERSION tools in your current shell, run: source $SHELL_PROFILE"
            fi
          else
            echo -e "${YELLOW}Warning: Couldn't find shell profile to update PATH${NC}"
            echo "Please manually add the following to your shell profile:"
            echo "export PATH=\"$PG_PATH:\$PATH\""
          fi
          
          # Create project's bin directory if it doesn't exist
          mkdir -p "$(dirname "$0")/bin/pg$PG_TARGET_VERSION"
          
          # Create symbolic links for PostgreSQL tools in the project bin directory
          echo "Creating symbolic links for PostgreSQL $PG_TARGET_VERSION tools..."
          for tool in pg_dump pg_restore psql; do
            if [ -f "$PG_PATH/$tool" ]; then
              ln -sf "$PG_PATH/$tool" "$(dirname "$0")/bin/pg$PG_TARGET_VERSION/$tool"
              echo "  Linked $tool"
            fi
          done
        else
          echo -e "${YELLOW}Warning: Couldn't find PostgreSQL binaries path${NC}"
        fi
      else
        echo -e "${RED}Error: Homebrew not found. Please install Homebrew first:${NC}"
        echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
      fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
      # Linux (Debian/Ubuntu)
      if command_exists apt-get; then
        echo "Installing PostgreSQL $PG_TARGET_VERSION client on Ubuntu/Debian..."
        # Add PostgreSQL repository
        sudo sh -c "echo 'deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main' > /etc/apt/sources.list.d/pgdg.list"
        wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
        sudo apt-get update
        sudo apt-get install -y postgresql-client-$PG_TARGET_VERSION
      # RHEL/CentOS
      elif command_exists yum; then
        echo "Installing PostgreSQL $PG_TARGET_VERSION client on RHEL/CentOS..."
        # Install PGDG repo
        sudo yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %rhel)-x86_64/pgdg-redhat-repo-latest.noarch.rpm
        sudo yum install -y postgresql$PG_TARGET_VERSION
      else
        echo -e "${RED}Error: Unsupported Linux distribution. Please install PostgreSQL client tools manually.${NC}"
        exit 1
      fi
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
      # Windows
      echo -e "${RED}Error: On Windows, please install PostgreSQL client tools manually:${NC}"
      echo "  1. Download from https://www.postgresql.org/download/windows/"
      echo "  2. Add bin directory to your PATH"
      exit 1
    else
      echo -e "${RED}Error: Unsupported operating system. Please install PostgreSQL client tools manually.${NC}"
      exit 1
    fi
    
    # Check if installation succeeded
    echo ""
    echo -e "${BLUE}Verifying PostgreSQL tools installation...${NC}"
    
    all_tools_available=true
    
    # Need to refresh path if we're using brew
    if [[ "$OSTYPE" == "darwin"* ]] && [ -n "$PG_PATH" ]; then
      export PATH="$PG_PATH:$PATH"
    fi
    
    for tool in pg_dump pg_restore psql; do
      if ! command_exists "$tool"; then
        echo -e "${RED}✗ $tool is still not available${NC}"
        all_tools_available=false
      else
        echo -e "${GREEN}✓ $tool is available${NC}"
        
        # Check version
        if [ "$tool" = "psql" ]; then
          client_version_str=$($tool --version 2>/dev/null)
          client_version=$(get_pg_version "$client_version_str")
          echo "   Client version: $client_version"
          
          if [ "$client_version" != "$PG_TARGET_VERSION" ]; then
            echo -e "${YELLOW}⚠ Warning: Installed version ($client_version) does not match target version ($PG_TARGET_VERSION)${NC}"
            echo "This may cause version mismatch errors when connecting to PostgreSQL $PG_TARGET_VERSION servers."
            
            # Try to use the specific version if we're on macOS and have brew
            if [[ "$OSTYPE" == "darwin"* ]] && command_exists brew; then
              echo "Try using the specific version with:"
              echo "export PATH=\"$(brew --prefix postgresql@$PG_TARGET_VERSION)/bin:\$PATH\""
            fi
          fi
        fi
      fi
    done
    
    if [ "$all_tools_available" = false ]; then
      echo -e "${RED}Error: PostgreSQL installation may have failed. Please install manually.${NC}"
      exit 1
    fi
  else
    echo -e "${GREEN}PostgreSQL $PG_TARGET_VERSION client tools are already installed correctly.${NC}"
  fi
  
  return 0
}

# Install db-tools
install_db_tools() {
  echo ""
  echo -e "${BLUE}Installing DB Tools...${NC}"
  npm install
  
  echo ""
  echo -e "${BLUE}Making DB Tools available globally...${NC}"
  npm install -g .
  
  echo ""
  echo -e "${GREEN}Installation complete! You can now use DB Tools.${NC}"
  echo "  Try running: db-tools --help"
}

# Main script flow
check_pg_tools
install_db_tools

exit 0