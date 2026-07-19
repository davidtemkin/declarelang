#!/bin/zsh
# Verify every ```declare fence in the given chapter files compiles and boots.
# Usage: ./checkfences.sh content/02-two-brackets.md [more.md ...]
cd "$(dirname "$0")/../../.."   # repo root
fail=0
for md in "$@"; do
  python3 - "$md" <<'EOF'
import re, sys, pathlib
md = pathlib.Path(sys.argv[1])
fences = re.findall(r'```declare\n(.*?)```', md.read_text(), re.S)
for i, f in enumerate(fences):
    pathlib.Path(f'my-apps/_fence_{md.stem}_{i}.declare').write_text(f)
print(f'{md.name}: {len(fences)} fences')
EOF
  for f in my-apps/_fence_*.declare; do
    [ -e "$f" ] || continue
    out=$(node tools/verify.mjs "$f" 2>&1 | tail -1)
    case "$out" in
      *"clean through R4"*) echo "  ok   $(basename $f)";;
      *) echo "  FAIL $(basename $f): $out"; fail=1;;
    esac
    rm "$f"
  done
done
exit $fail
