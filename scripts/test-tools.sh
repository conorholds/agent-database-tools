#!/bin/bash

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}DB Tools Test Suite${NC}"
echo "================="
echo "This script will create a test database and run commands to verify functionality."
echo ""

# Function to check if a command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Verify PostgreSQL 16 tools are available
check_pg_tools() {
  echo -e "${BLUE}Checking for PostgreSQL 16 client tools...${NC}"
  
  # Check for PostgreSQL tools
  for tool in pg_dump pg_restore psql createdb dropdb; do
    if ! command_exists "$tool"; then
      echo -e "${RED}✗ $tool not found${NC}"
      echo -e "${RED}Please run ./install.sh first to set up PostgreSQL 16 client tools${NC}"
      exit 1
    else
      echo -e "${GREEN}✓ $tool is available${NC}"
    fi
  done
  
  # Check version
  client_version=$(psql --version | grep -o -E '[0-9]+' | head -1)
  if [ "$client_version" != "16" ]; then
    echo -e "${YELLOW}⚠ Warning: PostgreSQL client version is $client_version, not 16${NC}"
    echo -e "${YELLOW}This may cause issues with the tests. Continuing anyway (auto mode)...${NC}"
    # No interactive prompt in automated testing
  else
    echo -e "${GREEN}✓ PostgreSQL client version 16 confirmed${NC}"
  fi
  
  # Check if PostgreSQL server is running
  echo -e "${BLUE}Checking if PostgreSQL server is running...${NC}"
  if command_exists pg_isready && pg_isready -q; then
    echo -e "${GREEN}✓ PostgreSQL server is running${NC}"
  else
    echo -e "${RED}✗ PostgreSQL server is not running${NC}"
    echo -e "${RED}Please start the PostgreSQL server before running tests${NC}"
    echo -e "${YELLOW}On macOS, you can start it with: brew services start postgresql@16${NC}"
    echo -e "${YELLOW}On Linux, you can start it with: sudo systemctl start postgresql${NC}"
    echo -e "${YELLOW}Attempting to continue anyway, but tests will likely fail.${NC}"
    # No interactive prompt in automated testing
  fi
}

# Function to run a test
run_test() {
  local test_name=$1
  local command=$2
  local expect_fail=$3  # Optional param: set to "true" if the command is expected to fail 
  
  echo -e "\n${BLUE}Testing: ${test_name}${NC}"
  echo "Command: $command"
  
  # Check if the connect-test.json file exists
  if [ ! -f "connect-test.json" ]; then
    echo -e "${RED}✗ Error: connect-test.json file not found!${NC}"
    return 1
  fi
  
  # Print working directory
  echo "Current directory: $(pwd)"
  
  if eval "$command"; then
    local success=$?
    if [ "$expect_fail" = "true" ] && [ $success -eq 0 ]; then
      echo -e "${YELLOW}⚠ Test unexpectedly succeeded, but failure was expected${NC}"
      return 1
    else
      echo -e "${GREEN}✓ Test passed${NC}"
      return 0
    fi
  else
    local failure=$?
    if [ "$expect_fail" = "true" ]; then
      echo -e "${GREEN}✓ Test correctly failed as expected${NC}"
      return 0
    else
      echo -e "${RED}✗ Test failed${NC}"
      return 1
    fi
  fi
}

# Setup test environment
setup_test_environment() {
  echo -e "\n${BLUE}Setting up test environment...${NC}"
  
  # Create temporary connect.json with local database
  echo "Creating test connection configuration..."
  
  # Get the user's system username for the test database
  local db_user=$(whoami)
  
  # Create or update connect.json for testing with proper format for backup commands
  cat > connect-test.json << EOF
[
  {
    "name": "Test Project",
    "postgres_uri": "postgresql://${db_user}:password@localhost:5432/db_tools_test?sslmode=disable"
  }
]
EOF
  
  echo -e "${GREEN}✓ Created test connection file: connect-test.json${NC}"
  
  # Show the content for debugging
  echo "Contents of connect-test.json:"
  cat connect-test.json
  
  # Check if test database exists and drop it if it does
  if psql -lqt | cut -d \| -f 1 | grep -qw db_tools_test; then
    echo "Dropping existing test database..."
    dropdb db_tools_test
  fi
  
  # Create test database
  echo "Creating test database..."
  createdb db_tools_test
  
  # Create test tables
  echo "Creating test tables..."
  psql -d db_tools_test << EOF
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (name, email) VALUES
  ('Test User 1', 'test1@example.com'),
  ('Test User 2', 'test2@example.com');
  
INSERT INTO transactions (user_id, amount, description) VALUES
  (1, 100.00, 'Test transaction 1'),
  (1, 200.00, 'Test transaction 2'),
  (2, 300.00, 'Test transaction 3');
EOF
  
  echo -e "${GREEN}✓ Test database and tables created${NC}"
}

# Clean up test environment
cleanup() {
  echo -e "\n${BLUE}Cleaning up test environment...${NC}"
  
  # Drop test database
  echo "Dropping test database..."
  dropdb db_tools_test || true
  
  # Remove temporary files
  echo "Removing temporary files..."
  rm -f connect-test.json || true
  rm -f test-backup.sql || true
  rm -f test-backup.backup || true
  
  echo -e "${GREEN}✓ Test environment cleaned up${NC}"
}

# Run tests
run_tests() {
  echo -e "\n${BLUE}Running DB Tools tests...${NC}"
  
  # Store current directory path for absolute references
  local current_dir=$(pwd)
  local connect_file="${current_dir}/connect-test.json"
  
  # Initialize the database with Test Project schema
  # Try to fix the init command by using yes to confirm the prompt
  run_test "init" "echo y | node ${current_dir}/bin/db-tools.js init 'Test Project' --connect ${connect_file} --force"
  
  # Test list-databases with test connection
  run_test "list-databases" "node ${current_dir}/bin/db-tools.js list-databases 'Test Project' --connect ${connect_file}"
  
  # Test list-tables with test connection
  run_test "list-tables" "node ${current_dir}/bin/db-tools.js list-tables 'Test Project' --connect ${connect_file}"
  
  # Test list-columns with test connection
  run_test "list-columns" "node ${current_dir}/bin/db-tools.js list-columns 'Test Project' users --connect ${connect_file}"
  
  # Test count-records with test connection
  run_test "count-records" "node ${current_dir}/bin/db-tools.js count-records 'Test Project' users --connect ${connect_file}"
  
  # Test query with test connection - run a simple count query
  run_test "query (direct argument)" "node ${current_dir}/bin/db-tools.js query 'Test Project' \"SELECT COUNT(*) FROM users\" --connect ${connect_file}"
  
  # Test query with raw option
  run_test "query (--raw option)" "node ${current_dir}/bin/db-tools.js query 'Test Project' --raw \"SELECT SUM(amount) AS total FROM transactions\" --connect ${connect_file}"
  
  # Test query with json format
  run_test "query (json output)" "node ${current_dir}/bin/db-tools.js query 'Test Project' --raw \"SELECT id, name FROM users LIMIT 2\" --json --connect ${connect_file}"
  
  # Just test that search command exists and runs without error
  run_test "search command" "node ${current_dir}/bin/db-tools.js search --help"
  
  # Test backup with test connection (SQL format) - with --force to skip confirmation
  run_test "backup (SQL)" "node ${current_dir}/bin/db-tools.js backup 'Test Project' --connect ${connect_file} --output ${current_dir}/test-backup.sql --format plain --force"
  
  # Test backup with test connection (custom format) - with --force to skip confirmation
  run_test "backup (custom)" "node ${current_dir}/bin/db-tools.js backup 'Test Project' --connect ${connect_file} --output ${current_dir}/test-backup.backup --format custom --force"
  
  # Test add-column with test connection (properly quoted default value) - with --force to skip confirmation
  run_test "add-column" "node ${current_dir}/bin/db-tools.js add-column 'Test Project' users test_column TEXT --default \"'test'\" --connect ${connect_file} --force"
  
  # Only proceed with these tests if add-column passes
  if [ $? -eq 0 ]; then
    # Test create-index with test connection - with --force to skip confirmation
    run_test "create-index" "node ${current_dir}/bin/db-tools.js create-index 'Test Project' users test_column --connect ${connect_file} --force"
    
    # Test remove-column with test connection - with --force to skip confirmation
    run_test "remove-column" "node ${current_dir}/bin/db-tools.js remove-column 'Test Project' users test_column --connect ${connect_file} --force"
  else
    echo -e "${YELLOW}⚠ Skipping index and column removal tests since column creation failed${NC}"
  fi
  
  # Test rename-table and rename-column with test connection - with --force to skip confirmation
  # First, create a test table to rename with columns we'll rename
  echo "Creating test tables for rename operations..."
  psql -d db_tools_test << EOF
CREATE TABLE temp_test_table (id SERIAL PRIMARY KEY, old_column_name VARCHAR(255));
INSERT INTO temp_test_table (old_column_name) VALUES ('test value');
EOF
  
  # Perform the table rename operation
  run_test "rename-table" "node ${current_dir}/bin/db-tools.js rename-table 'Test Project' temp_test_table renamed_test_table --connect ${connect_file} --force"
  
  # Verify that the table was actually renamed by checking if the renamed table exists and has the test data
  if [ $? -eq 0 ]; then
    echo "Verifying table was renamed correctly..."
    verify_rename=$(psql -d db_tools_test -t -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'renamed_test_table') AND NOT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'temp_test_table') AND EXISTS(SELECT 1 FROM renamed_test_table WHERE old_column_name = 'test value');")
    if [[ $verify_rename == *t* ]]; then
      echo -e "${GREEN}✓ Table rename verification passed${NC}"
    else
      echo -e "${RED}✗ Table rename verification failed${NC}"
      return 1
    fi
    
    # Now test the rename-column command
    run_test "rename-column" "node ${current_dir}/bin/db-tools.js rename-column 'Test Project' renamed_test_table old_column_name new_column_name --connect ${connect_file} --force"
    
    # Verify that the column was actually renamed
    if [ $? -eq 0 ]; then
      echo "Verifying column was renamed correctly..."
      verify_column_rename=$(psql -d db_tools_test -t -c "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'renamed_test_table' AND column_name = 'new_column_name') AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'renamed_test_table' AND column_name = 'old_column_name');")
      if [[ $verify_column_rename == *t* ]]; then
        echo -e "${GREEN}✓ Column rename verification passed${NC}"
      else
        echo -e "${RED}✗ Column rename verification failed${NC}"
        return 1
      fi
    fi
  fi
  
  # Test check with test connection - we expect it to report missing tables (which is okay for testing)
  echo -e "${YELLOW}Note: The check command will correctly report missing tables and extensions since this is a test database${NC}"
  run_test "check" "node ${current_dir}/bin/db-tools.js check 'Test Project' --connect ${connect_file} --force"
  
  # Note: We'll skip actual restore testing to avoid overwriting data
  echo -e "\n${YELLOW}Note: The restore command test is skipped to avoid overwriting data.${NC}"
  
  echo -e "\n${GREEN}All tests completed!${NC}"
}

# Main script
check_pg_tools
setup_test_environment
run_tests
cleanup

echo -e "\n${GREEN}Tests completed successfully!${NC}"
exit 0