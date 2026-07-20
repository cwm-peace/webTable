#!/usr/bin/env bash

set -u

FAILED=0
WARNED=0

pass() {
  printf '[PASS] %s\n' "$1"
}

warn() {
  WARNED=1
  printf '[WARN] %s\n' "$1"
}

fail() {
  FAILED=1
  printf '[FAIL] %s\n' "$1"
}

info() {
  printf '[INFO] %s\n' "$1"
}

require_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "$1 is available"
  else
    fail "$1 is not installed or not in PATH"
  fi
}

parse_jdbc_mysql_url() {
  local jdbc_url="$1"
  local stripped host_port_path host_port

  stripped="${jdbc_url#jdbc:mysql://}"
  host_port_path="${stripped%%\?*}"
  host_port="${host_port_path%%/*}"
  DB_NAME="${host_port_path#*/}"

  if [ "$host_port" = "$DB_NAME" ]; then
    DB_NAME="webtable"
  fi

  if [ "${host_port#*:}" = "$host_port" ]; then
    DB_HOST="$host_port"
    DB_PORT="3306"
  else
    DB_HOST="${host_port%%:*}"
    DB_PORT="${host_port##*:}"
  fi

  if [ -z "$DB_HOST" ]; then
    DB_HOST="127.0.0.1"
  fi
  if [ -z "$DB_PORT" ]; then
    DB_PORT="3306"
  fi
  if [ -z "$DB_NAME" ]; then
    DB_NAME="webtable"
  fi
}

mysql_client() {
  MYSQL_PWD="$DB_PASSWORD" mysql --protocol=tcp -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" "$@"
}

mysql_admin() {
  MYSQL_PWD="$DB_PASSWORD" mysqladmin --protocol=tcp -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" "$@"
}

check_java() {
  require_command java
  if command -v java >/dev/null 2>&1; then
    local version_line
    version_line="$(java -version 2>&1 | head -n 1)"
    case "$version_line" in
      *'"21.'*|*'"21"'*|*' 21.'*) pass "Java version looks compatible: $version_line" ;;
      *) warn "Java 21 is required; detected: $version_line" ;;
    esac
  fi
}

check_node() {
  require_command node
  require_command npm
  if command -v node >/dev/null 2>&1; then
    local node_version major
    node_version="$(node -v 2>/dev/null || true)"
    major="${node_version#v}"
    major="${major%%.*}"
    if [ -n "$major" ] && [ "$major" -ge 18 ] 2>/dev/null; then
      pass "Node.js version looks compatible: $node_version"
    else
      warn "Node.js 18+ is required; detected: ${node_version:-unknown}"
    fi
  fi
}

check_maven_wrapper() {
  if [ -x "./mvnw" ]; then
    pass "Maven Wrapper is executable"
  elif [ -f "./mvnw" ]; then
    warn "Maven Wrapper exists but is not executable; run chmod +x ./mvnw"
  else
    fail "Maven Wrapper ./mvnw is missing"
  fi
}

check_required_env() {
  if [ -n "${WEBTABLE_ADMIN_PASSWORD:-}" ]; then
    if [ "${#WEBTABLE_ADMIN_PASSWORD}" -ge 12 ]; then
      pass "WEBTABLE_ADMIN_PASSWORD is set and long enough"
    else
      fail "WEBTABLE_ADMIN_PASSWORD must be at least 12 characters"
    fi
  else
    fail "WEBTABLE_ADMIN_PASSWORD is required"
  fi

  if [ -z "${WEBTABLE_DB_URL:-}" ]; then
    warn "WEBTABLE_DB_URL is not set; using application default jdbc:mysql://localhost:3306/webtable"
  else
    pass "WEBTABLE_DB_URL is set"
  fi

  if [ -z "${WEBTABLE_DB_USERNAME:-}" ]; then
    warn "WEBTABLE_DB_USERNAME is not set; using application default webtable"
  else
    pass "WEBTABLE_DB_USERNAME is set"
  fi

  if [ -n "${WEBTABLE_DB_PASSWORD:-}" ]; then
    pass "WEBTABLE_DB_PASSWORD is set"
  else
    fail "WEBTABLE_DB_PASSWORD is required for deployment and integration testing"
  fi
}

check_redis() {
  require_command redis-cli
  if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q '^PONG$'; then
      pass "Redis is reachable at 127.0.0.1:6379"
    else
      fail "Redis is not reachable at 127.0.0.1:6379"
    fi
  fi
}

check_mysql() {
  require_command mysql
  require_command mysqladmin

  DB_URL="${WEBTABLE_DB_URL:-jdbc:mysql://localhost:3306/webtable?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true}"
  DB_USERNAME="${WEBTABLE_DB_USERNAME:-webtable}"
  DB_PASSWORD="${WEBTABLE_DB_PASSWORD:-}"
  DB_HOST=""
  DB_PORT=""
  DB_NAME=""
  parse_jdbc_mysql_url "$DB_URL"

  info "MySQL target: ${DB_USERNAME}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

  if [ -z "$DB_PASSWORD" ]; then
    fail "Skipping MySQL connection check because WEBTABLE_DB_PASSWORD is empty"
    return
  fi

  if mysql_admin ping >/dev/null 2>&1; then
    pass "MySQL accepts the configured credentials"
  else
    fail "MySQL rejected the configured credentials or is unreachable"
    return
  fi

  local table_count left_count right_count
  if table_count="$(mysql_client "$DB_NAME" -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('submissions','personal_info','photos','assessment_left','assessment_right','assessment_left_template','assessment_right_template');" 2>/dev/null)"; then
    if [ "$table_count" = "7" ]; then
      pass "Required database tables exist"
    else
      fail "Expected 7 required tables in ${DB_NAME}, found ${table_count:-0}; run src/main/resources/schema.sql"
    fi
  else
    fail "Database ${DB_NAME} is not accessible or does not exist"
    return
  fi

  if left_count="$(mysql_client "$DB_NAME" -N -B -e "SELECT COUNT(*) FROM assessment_left_template;" 2>/dev/null)"; then
    if [ "$left_count" = "65" ]; then
      pass "Left assessment template contains 65 rows"
    else
      fail "Left assessment template should contain 65 rows, found ${left_count:-0}"
    fi
  else
    fail "Cannot read assessment_left_template"
  fi

  if right_count="$(mysql_client "$DB_NAME" -N -B -e "SELECT COUNT(*) FROM assessment_right_template;" 2>/dev/null)"; then
    if [ "$right_count" = "60" ]; then
      pass "Right assessment template contains 60 rows"
    else
      fail "Right assessment template should contain 60 rows, found ${right_count:-0}"
    fi
  else
    fail "Cannot read assessment_right_template"
  fi
}

check_ports() {
  if ! command -v lsof >/dev/null 2>&1; then
    warn "lsof is not available; skipping port availability checks"
    return
  fi

  if lsof -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
    warn "Port 8081 is already in use; backend may already be running or the port must be freed"
  else
    pass "Port 8081 is available"
  fi

  if lsof -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
    warn "Port 5173 is already in use; frontend may already be running or the port must be freed"
  else
    pass "Port 5173 is available"
  fi
}

main() {
  info "WebTable preflight check"
  check_java
  check_node
  check_maven_wrapper
  check_required_env
  check_redis
  check_mysql
  check_ports

  if [ "$FAILED" -ne 0 ]; then
    printf '[FAIL] Preflight check failed. Fix the items above before integration testing.\n'
    exit 1
  fi
  if [ "$WARNED" -ne 0 ]; then
    printf '[WARN] Preflight check passed with warnings. Review the items above before deployment.\n'
    exit 0
  fi
  printf '[PASS] Preflight check passed. Environment is ready for integration testing.\n'
}

main "$@"
