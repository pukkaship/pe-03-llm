#!/bin/bash
# exercise-guard.sh — learner-repo variant
# Intercepts Write/StrReplace tool calls in Pukkaship exercise repos.

set -euo pipefail

input=$(cat)

path=$(echo "$input" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    inp = d.get('tool_input', {})
    print(inp.get('path', ''))
except Exception:
    print('')
")

if [[ -z "$path" ]]; then
  echo '{ "permission": "allow" }'
  exit 0
fi

if [[ "$path" != /* ]]; then
  path="$(pwd)/$path"
fi

is_protected=0
reason=""

# Pattern 1: learner source tree (repo-root src/)
if [[ "$path" =~ /src/ ]] && [[ ! "$path" =~ node_modules ]]; then
  is_protected=1
  reason="student exercise source tree (src/)"
fi

# Pattern 2: file-level marker
if [[ $is_protected -eq 0 && -f "$path" ]]; then
  if grep -q "@pukkaship-exercise" "$path" 2>/dev/null; then
    is_protected=1
    reason="file is marked @pukkaship-exercise"
  fi
fi

if [[ $is_protected -eq 1 ]]; then
  python3 -c "
import json
msg_user = (
    'This is a Pukkaship student exercise file ($reason). '
    'The student should solve this themselves. '
    'Proceed only if you are the instructor making a deliberate change.'
)
msg_agent = (
    'This file is protected as a student exercise ($reason). '
    'Do not fix bugs or complete TODOs here. '
    'Guide the student with questions and hints instead. '
    'Only proceed if the user explicitly confirms as the instructor.'
)
print(json.dumps({
    'permission': 'ask',
    'user_message': msg_user,
    'agent_message': msg_agent
}))
" -- "$reason"
  exit 0
fi

echo '{ "permission": "allow" }'
exit 0
