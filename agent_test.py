import requests
import re
import sys
import time
import random
import json

# Set your OpenAI API key as an environment variable: OPENAI_API_KEY
import os
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "your-openai-api-key-here")
API_URL = "https://api.openai.com/v1/chat/completions"
MODEL_NAME = "gpt-5-mini"

# Global token usage tracking
cumulative_tokens = {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
}

def reset_cumulative_tokens():
    global cumulative_tokens
    cumulative_tokens = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

# ---------------- API Helpers ----------------
def _to_openai_message(role, text):
    return {
        "role": role,
        "content": [{"type": "text", "text": text}]
    }

def call_api_chat(system_msg, messages, max_retries=6, connect_timeout=15, read_timeout=180):
    payload = {
        "model": MODEL_NAME,
        "messages": [_to_openai_message("developer", system_msg)] + [
            _to_openai_message(m["role"], m["content"]) for m in messages
        ],
        "response_format": {"type": "text"},
        "verbosity": "low",
        "reasoning_effort": "low"
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}"
    }

    for attempt in range(1, max_retries + 1):
        try:
            print(f"API: Request attempt {attempt}/{max_retries}")
            r = requests.post(API_URL, json=payload, headers=headers, timeout=(connect_timeout, read_timeout))
            status = r.status_code
            if status == 429 or 500 <= status < 600:
                err_text = ""
                try:
                    err_text = r.text[:500]
                except Exception:
                    pass
                delay = min(2 ** attempt + random.uniform(0, 1), 30)
                print(f"API: HTTP {status}. Retrying in {delay:.1f}s. Body: {err_text}")
                time.sleep(delay)
                continue
            r.raise_for_status()
            data = r.json()

            if "usage" in data:
                usage = data["usage"]
                prompt_tokens = usage.get('prompt_tokens', 0)
                completion_tokens = usage.get('completion_tokens', 0)
                total_tokens = usage.get('total_tokens', 0)
                cumulative_tokens["prompt_tokens"] += prompt_tokens
                cumulative_tokens["completion_tokens"] += completion_tokens
                cumulative_tokens["total_tokens"] += total_tokens
                print(f"API: Tokens used - Prompt: {prompt_tokens}, Completion: {completion_tokens}, Total: {total_tokens}")

            return data["choices"][0]["message"]["content"]
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectTimeout) as e:
            delay = min(2 ** attempt + random.uniform(0, 1), 30)
            print(f"API: Timeout ({type(e).__name__}). Retrying in {delay:.1f}s...")
            time.sleep(delay)
        except requests.exceptions.JSONDecodeError:
            delay = min(2 ** attempt + random.uniform(0, 1), 30)
            print(f"API: JSON decode error. Retrying in {delay:.1f}s...")
            time.sleep(delay)
        except requests.exceptions.RequestException as e:
            print(f"API: Request failed: {e}")
            raise
        except Exception as e:
            print(f"API: Unexpected error: {e}")
            raise
    raise RuntimeError("API: Exhausted retries without success.")

# ---------------- Utilities ----------------
def strip_code_fences(text):
    return re.sub(r"^\s*```[a-zA-Z]*\s*|\s*```\s*$", "", text, flags=re.MULTILINE)

def build_line_index(text):
    lines = text.splitlines(keepends=True)
    starts, pos = [], 0
    for ln in lines:
        starts.append(pos)
        pos += len(ln)
    return lines, starts

def pos_to_linecol(pos, starts):
    lo, hi = 0, len(starts)-1
    line = 0
    while lo <= hi:
        mid = (lo + hi)//2
        if starts[mid] <= pos:
            line = mid
            lo = mid + 1
        else:
            hi = mid - 1
    col = pos - starts[line] + 1
    return line, col

def add_line_prefixes(html, prefix="ln"):
    # Prefix each line with "ln{N}, " for patch reference
    lines = html.splitlines()
    prefixed = []
    for i, ln in enumerate(lines, 1):
        prefixed.append(f"{prefix}{i}, {ln}")
    return "\n".join(prefixed)

# ---------------- Simple HTML syntax linter ----------------
VOID_TAGS = {"area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr","command","keygen","menuitem"}

def strip_comments(html):
    return re.sub(r"<!--[\s\S]*?-->", "", html)

def remove_blocks(html, tag):
    return re.sub(rf"<{tag}\b[\s\S]*?</{tag}\s*>", "", html, flags=re.IGNORECASE)

def lint_html(html):
    errors = []
    html = re.sub(r"^\s*```[a-zA-Z]*\s*|\s*```\s*$", "", html, flags=re.MULTILINE)
    check_html = strip_comments(html)
    scrubbed = remove_blocks(remove_blocks(check_html, "script"), "style")
    lines, starts = build_line_index(check_html)

    if not re.search(r"^\s*<!doctype\s+html\s*>", check_html, flags=re.IGNORECASE):
        snippet = lines[0].strip() if lines else ""
        errors.append({"message": "Missing <!DOCTYPE html> at top", "line": 1, "snippet": snippet})

    for tag in ["html", "head", "body"]:
        count = len(re.findall(rf"<\s*{tag}\b", check_html, flags=re.IGNORECASE))
        if count == 0:
            errors.append({"message": f"Missing <{tag}> tag", "line": 1, "snippet": ""})
        elif count > 1:
            errors.append({"message": f"Multiple <{tag}> tags found ({count})", "line": 1, "snippet": ""})

    for t in ["script", "style"]:
        opens = len(re.findall(rf"<\s*{t}\b", check_html, flags=re.IGNORECASE))
        closes = len(re.findall(rf"</\s*{t}\s*>", check_html, flags=re.IGNORECASE))
        if opens != closes:
            errors.append({"message": f"Unbalanced <{t}> tags (open={opens}, close={closes})", "line": 1, "snippet": ""})

    tag_iter = re.finditer(r"<\s*(/)?\s*([a-zA-Z][a-zA-Z0-9\-]*)\b[^>]*?>", scrubbed)
    stack = []
    for m in tag_iter:
        closing = bool(m.group(1))
        tag = m.group(2).lower()
        pos = m.start()
        if tag == "!doctype":
            continue
        is_self_closed = scrubbed[m.start():m.end()].rstrip().endswith("/>")
        if not closing:
            if tag in VOID_TAGS or is_self_closed:
                continue
            stack.append((tag, pos))
        else:
            if tag in VOID_TAGS:
                line, _ = pos_to_linecol(pos, starts)
                snippet = lines[line].strip() if line < len(lines) else ""
                errors.append({"message": f"Unexpected closing tag </{tag}> for void element", "line": line+1, "snippet": snippet})
                continue
            if not stack:
                line, _ = pos_to_linecol(pos, starts)
                snippet = lines[line].strip() if line < len(lines) else ""
                errors.append({"message": f"Unmatched closing tag </{tag}>", "line": line+1, "snippet": snippet})
                continue
            open_tag, open_pos = stack[-1]
            if open_tag != tag:
                line, _ = pos_to_linecol(pos, starts)
                snippet = lines[line].strip() if line < len(lines) else ""
                errors.append({"message": f"Mismatched closing tag </{tag}>; expected </{open_tag}>", "line": line+1, "snippet": snippet})
                stack.pop()
            else:
                stack.pop()

    for open_tag, open_pos in stack:
        line, _ = pos_to_linecol(open_pos, starts)
        snippet = lines[line].strip() if line < len(lines) else ""
        errors.append({"message": f"Unclosed <{open_tag}> tag", "line": line+1, "snippet": snippet})

    return errors

def format_errors_for_prompt(errors, max_items=12):
    out = []
    for i, e in enumerate(errors[:max_items], 1):
        snippet = (e.get("snippet") or "").strip()
        snippet = snippet[:240] + ("..." if len(snippet) > 240 else "")
        out.append(f"{i}. Line {e.get('line','?')}: {e.get('message')} | Snippet: {snippet}")
    more = len(errors) - len(out)
    if more > 0:
        out.append(f"... and {more} more")
    return "\n".join(out)

# ---------------- General issue analyzer ----------------
def analyze_general_issues(html):
    issues = []

    def add_issue(name, detail, hint, severity="warn"):
        issues.append({"name": name, "detail": detail, "hint": hint, "severity": severity})

    if not re.search(r'<meta\s+name=["\']viewport["\']', html, flags=re.IGNORECASE):
        add_issue("viewport_meta_missing",
                  "No viewport meta for mobile.",
                  "Add: <meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no\">",
                  "error")

    has_touch = re.search(r'addEventListener\(\s*[\'"](touchstart|touchmove|touchend|pointerdown|pointermove|pointerup)[\'"]', html)
    if not has_touch:
        add_issue("touch_controls_missing",
                  "No touch or pointer event handlers detected.",
                  "Add touch/pointer event handlers or on-screen controls for mobile.", "error")

    if re.search(r'\b(WASD|WASD|arrow keys|Arrow(?:Left|Right|Up|Down)|KeyW|KeyA|KeyS|KeyD)\b', html, flags=re.IGNORECASE):
        add_issue("keyboard_instructions_present",
                  "UI or code references keyboard controls.",
                  "Update UI text to reflect touch controls, map keyboard to touch as fallback.", "warn")

    if not re.search(r'requestAnimationFrame\s*\(', html):
        add_issue("no_game_loop",
                  "No requestAnimationFrame game loop detected.",
                  "Ensure there is a main loop to update and render the game each frame.", "warn")

    if re.search(r"data:audio/wav;base64", html, flags=re.IGNORECASE):
        add_issue("embedded_audio_data_uri",
                  "Large base64 audio embedded can fail to load and bloat file.",
                  "Prefer small SFX or remove embedded audio for MVP.", "warn")

    if not re.search(r"<canvas\b", html) and not re.search(r"id\s*=\s*['\"]game['\"]", html):
        add_issue("no_game_surface",
                  "No obvious game surface like <canvas> or #game container found.",
                  "Add a canvas or a game container element.", "warn")

    for btn_id in re.findall(r'id\s*=\s*["\'](restart|start|pause|menu)["\']', html, flags=re.IGNORECASE):
        handler_pat = rf"document\.getElementById\(\s*['\"]{btn_id}['\"]\s*\)\.addEventListener"
        if not re.search(handler_pat, html):
            add_issue("button_no_handler",
                      f"Button #{btn_id} lacks event listener.",
                      f"Add: document.getElementById('{btn_id}').addEventListener('click', ...)", "warn")

    if re.search(r"collision|intersect|hitTest", html, flags=re.IGNORECASE) is None and re.search(r"<canvas\b", html):
        add_issue("no_collision_logic",
                  "No explicit collision or boundary checks detected.",
                  "Add simple boundary or collision checks appropriate to the game.", "warn")

    opens = len(re.findall(r"<\s*script\b", html, flags=re.IGNORECASE))
    closes = len(re.findall(r"</\s*script\s*>", html, flags=re.IGNORECASE))
    if opens != closes:
        add_issue("unbalanced_script_tags",
                  f"Script tags open={opens} close={closes}.",
                  "Fix unbalanced <script> tags.", "error")

    return issues

def format_qg_feedback(issues):
    if not issues:
        return "QG_CHECK: OK\nNo general issues detected."
    lines = ["QG_CHECK: ISSUES"]
    for i, it in enumerate(issues, 1):
        lines.append(f"{i}. [{it['severity'].upper()}] {it['name']}: {it['detail']} | Hint: {it['hint']}")
    return "\n".join(lines)

# ---------------- Protocol parsing ----------------
COMMAND_PATTERN = re.compile(r"^\s*\[\[\s*([A-Z_]+)(?::\s*(.+?))?\s*\]\]\s*$", re.IGNORECASE | re.MULTILINE)

def parse_commands(text):
    cmds = []
    for m in COMMAND_PATTERN.finditer(text):
        cmd = m.group(1).upper().strip()
        arg = (m.group(2) or "").strip()
        cmds.append((cmd, arg))
    return cmds

def extract_html_doc(text):
    text = strip_code_fences(text)
    m = re.search(r"(?is)<!doctype\s+html[^>]*>.*?</html\s*>", text)
    if m:
        return m.group(0)
    return None

def extract_patch_block(text):
    m = re.search(r"(?is)\*\*\*\s*Begin Patch.*?\*\*\*\s*End Patch", text)
    if m:
        return m.group(0)
    return None

# ---------------- Patch Instructions (as provided) ----------------
PATCH_INSTRUCTIONS = """
*** Begin Patch
*** Update File: index.html
@@ <body>
-<line_number_to_delete>
+<new_code_line_to_add>
*** End Patch

Rules:
- For deletions: -<line_number> (single integer, refers to current file line number)
- For additions: +<new_code_line> (write full new line, no line number)
- Show 3 lines of context before and after each change if possible.
- If multiple sections need changes, repeat the *** Update File header.
- Only return the patch. Do not add commentary.
"""

# ---------------- System Prompt ----------------
def build_system_prompt():
    return """
You are UniAgent, a single self-steering agent that produces, critiques, and iterates on a single-file HTML5 mini-game.

Protocol (use this exact special syntax; each on its own line):
- [[DO:LINT]]            -> Ask controller to run an HTML syntax linter on your latest full HTML and return results.
- [[DO:QG_CHECK]]        -> Ask controller to run general QA checks (bugs, disconnects, mobile readiness) and return results.
- [[TOSELF: <prompt>]]   -> Send yourself a new "user" instruction for the next turn (self-feedback). Keep it concise and actionable.
- [[ASK:FINAL_OK?]]      -> Ask controller if all checks are clear. Controller will reply. If not clear, continue improving.
- [[FINAL]]              -> Use only when you have a clean, mobile-friendly, playable single-file HTML and all checks are clear.

Optional patch mode:
- When the controller provides a numbered file view and patch instructions, and changes are small, respond with ONLY a patch using that format. Otherwise output full HTML.

Rules:
- Always output one complete, valid HTML5 document (<!DOCTYPE html> ... </html>) whenever you write or revise code, unless controller explicitly requests patch-only mode.
- After the HTML (or the patch), list any commands using the special syntax lines above. Zero or more per turn.
- Generate your TOSELF prompt by questioning general things:
  • Is any part of the code likely buggy or undefined?
  • Anything feels disconnected (buttons without handlers, loops not running, variables not declared)?
  • Is the UI mobile-ready (viewport meta, touch controls, 44px targets, 16px fonts)?
  • Are game loops and state transitions robust?
- If linter or QA feedback reports issues, fix them in the next HTML and request checks again.
- If controller responds that all checks are clear, emit [[FINAL]] with the final, full HTML.

Deliverable:
- A complete single-file <html> with inline <style> and <script>, playable and mobile-friendly.
"""

# ---------------- Patch Application ----------------
def apply_patch_to_html(current_html, patch_text):
    try:
        block = extract_patch_block(patch_text)
        if not block:
            return current_html, False, "No patch block found."

        # Extract lines between Begin and End
        lines = block.splitlines()
        del_nums = []
        add_lines = []
        for raw in lines:
            if raw.strip().startswith('***'):
                continue
            if raw.strip().startswith('@@'):
                continue
            if raw.startswith('-'):
                m = re.match(r"^-\s*(\d+)\s*$", raw.strip())
                if m:
                    del_nums.append(int(m.group(1)))
            elif raw.startswith('+'):
                # Addition: everything after '+' is the new line
                add_line = raw[1:]
                # Strip a single leading space commonly used in examples
                if add_line.startswith(' '):
                    add_line = add_line[1:]
                add_lines.append(add_line.rstrip('\n'))
            else:
                # context line -> ignored for simple application
                pass

        file_lines = current_html.splitlines(keepends=True)

        # Process deletions (descending to keep indices valid)
        del_nums_sorted = sorted(set(del_nums), reverse=True)
        for dn in del_nums_sorted:
            if 1 <= dn <= len(file_lines):
                file_lines.pop(dn - 1)

        # Determine insertion index
        if del_nums:
            insertion_index = max(min(min(del_nums) - 1, len(file_lines)), 0)
        else:
            insertion_index = len(file_lines)

        # Prepare addition lines with newline
        add_with_newlines = [(l if l.endswith('\n') else l + '\n') for l in add_lines]
        # Insert additions
        file_lines[insertion_index:insertion_index] = add_with_newlines

        new_html = "".join(file_lines)
        return new_html, True, ""
    except Exception as e:
        return current_html, False, f"Patch apply error: {e}"

# ---------------- Controller Orchestration ----------------
def should_use_patch(last_lint, last_qg, html_len):
    lint_count = len(last_lint or [])
    qg_errs = len([i for i in (last_qg or []) if i.get("severity") == "error"])
    total_small = lint_count + qg_errs
    if html_len == 0:
        return False
    return total_small > 0 and total_small <= 5 and html_len >= 200

def controller_loop(user_topic, max_rounds=12):
    system_prompt = build_system_prompt()
    messages = []

    # Initial instruction to kick off work, nudge use of protocol
    init_user = (
        f"User request: Build a tiny playable mini-game from this idea:\n"
        f"{user_topic}\n\n"
        f"Produce one complete HTML5 file now. Then request checks with [[DO:LINT]] and [[DO:QG_CHECK]], "
        f"and add one [[TOSELF: ...]] instruction to improve next turn."
    )
    messages.append({"role": "user", "content": init_user})

    latest_html = None
    last_lint = []
    last_qg = []
    patch_mode_hint = False

    for round_idx in range(1, max_rounds + 1):
        print(f"\n=== ROUND {round_idx} ===")
        response = call_api_chat(system_prompt, messages)
        response_text = strip_code_fences(response or "")
        print("\nAGENT OUTPUT (truncated preview):\n" + response_text[:600] + ("\n..." if len(response_text) > 600 else ""))

        # If patch returned, apply it first
        patch_block = extract_patch_block(response_text)
        followups = []
        if patch_block and latest_html:
            print("Controller: Detected patch. Applying...")
            new_html, ok, err = apply_patch_to_html(latest_html, patch_block)
            if ok:
                latest_html = new_html
                # Run checks automatically and provide results back
                lint_errors = lint_html(latest_html)
                last_lint = lint_errors
                qg = analyze_general_issues(latest_html)
                last_qg = qg
                lint_feedback = "LINTER: Found issues:\n" + format_errors_for_prompt(lint_errors) if lint_errors else "LINTER: OK. No syntax issues."
                qg_feedback = format_qg_feedback(qg)
                followups.append({"role": "user", "content": f"[[RESULT:LINT]]\n{lint_feedback}"})
                followups.append({"role": "user", "content": f"[[RESULT:QG_CHECK]]\n{qg_feedback}"})
            else:
                followups.append({"role": "user", "content": f"Controller: Patch apply failed: {err}. Please output the FULL corrected HTML instead."})

        # Extract HTML if present
        html_doc = extract_html_doc(response_text)
        if html_doc:
            latest_html = html_doc

        # Parse commands
        commands = parse_commands(response_text)
        print(f"\nDetected commands: {[c[0] for c in commands] or 'None'}")

        # Process commands
        for (cmd, arg) in commands:
            if cmd == "DO" and arg.upper() == "LINT":
                if not latest_html:
                    lint_feedback = "No full HTML detected to lint."
                    followups.append({"role": "user", "content": f"[[RESULT:LINT]]\n{lint_feedback}"})
                    last_lint = [{"message": "No HTML to lint", "line": 1, "snippet": ""}]
                else:
                    lint_errors = lint_html(latest_html)
                    last_lint = lint_errors
                    if lint_errors:
                        lint_feedback = "LINTER: Found issues:\n" + format_errors_for_prompt(lint_errors)
                    else:
                        lint_feedback = "LINTER: OK. No syntax issues."
                    followups.append({"role": "user", "content": f"[[RESULT:LINT]]\n{lint_feedback}"})

            elif cmd == "DO" and arg.upper() == "QG_CHECK":
                if not latest_html:
                    qg = [{"name": "no_html", "detail": "No HTML to analyze.", "hint": "Output full HTML first.", "severity": "error"}]
                    last_qg = qg
                    followups.append({"role": "user", "content": f"[[RESULT:QG_CHECK]]\n{format_qg_feedback(qg)}"})
                else:
                    qg = analyze_general_issues(latest_html)
                    last_qg = qg
                    followups.append({"role": "user", "content": f"[[RESULT:QG_CHECK]]\n{format_qg_feedback(qg)}"})

            elif cmd == "TOSELF":
                followups.append({"role": "user", "content": f"[[SELF-INSTRUCTION]] {arg}"})

            elif cmd == "ASK" and arg.upper() == "FINAL_OK?":
                if latest_html:
                    lint_errors = lint_html(latest_html)
                else:
                    lint_errors = [{"message": "No HTML", "line": 1, "snippet": ""}]
                qg_issues = analyze_general_issues(latest_html) if latest_html else [{"name": "no_html", "detail": "No HTML present.", "hint": "Provide HTML.", "severity": "error"}]

                ready = (len(lint_errors) == 0) and (len([i for i in qg_issues if i.get("severity") == "error"]) == 0)
                status = {
                    "lint_ok": len(lint_errors) == 0,
                    "qg_errors": len([i for i in qg_issues if i.get("severity") == "error"]),
                    "qg_total": len(qg_issues),
                    "has_html": bool(latest_html),
                    "decision": "READY" if ready else "NOT_READY"
                }
                report = [
                    "[[RESULT:FINAL_OK?]]",
                    f"Controller decision: {status['decision']}",
                    f"Lint OK: {status['lint_ok']}",
                    f"QG errors: {status['qg_errors']} of {status['qg_total']}",
                    f"Has HTML: {status['has_html']}",
                ]
                if not ready:
                    report.append("Recommendation: Address remaining issues, then re-run [[DO:LINT]] and [[DO:QG_CHECK]].")
                followups.append({"role": "user", "content": "\n".join(report)})

            elif cmd == "FINAL":
                if latest_html:
                    lint_errors = lint_html(latest_html)
                    qg_issues = analyze_general_issues(latest_html)
                    if len(lint_errors) == 0 and len([i for i in qg_issues if i.get("severity") == "error"]) == 0:
                        print("Controller: Final accepted.")
                        return latest_html
                    else:
                        msg = ["Controller: FINAL rejected due to remaining issues."]
                        if lint_errors:
                            msg.append("Linter issues:\n" + format_errors_for_prompt(lint_errors))
                        if qg_issues:
                            msg.append("QG issues:\n" + format_qg_feedback(qg_issues))
                        followups.append({"role": "user", "content": "\n".join(msg)})
                else:
                    followups.append({"role": "user", "content": "Controller: FINAL rejected. No HTML detected."})

            else:
                followups.append({"role": "user", "content": f"Controller: Unknown or unhandled command [[{cmd}:{arg}]]; continue with improvements and checks."})

        # Decide if we should enable patch mode for next turn
        if latest_html:
            enable_patch = should_use_patch(last_lint, last_qg, len(latest_html))
            if enable_patch:
                numbered = add_line_prefixes(latest_html, prefix="ln")
                patch_request = (
                    "PATCH MODE ENABLED: Changes appear small. In your NEXT reply, return ONLY the patch for index.html "
                    "using the format below. Do not include other text or protocol commands.\n\n"
                    "Current file with line prefixes for reference:\n"
                    f"{numbered}\n\n"
                    "Patch Specification:\n"
                    f"{PATCH_INSTRUCTIONS}"
                )
                followups.append({"role": "user", "content": patch_request})
                patch_mode_hint = True
            else:
                patch_mode_hint = False

        # If no commands and no patch were found, nudge agent appropriately
        if not commands and not patch_block:
            if latest_html:
                lint_errors = lint_html(latest_html)
                qg_issues = analyze_general_issues(latest_html)
                if len(lint_errors) == 0 and len([i for i in qg_issues if i.get("severity") == "error"]) == 0:
                    followups.append({"role": "user", "content": "Controller: All checks pass. Reply with [[FINAL]] and include the final full HTML again."})
                else:
                    nudge = ["Controller: No commands detected. Please fix issues and request checks."]
                    if lint_errors:
                        nudge.append("Linter issues:\n" + format_errors_for_prompt(lint_errors))
                    if qg_issues:
                        nudge.append("QG issues:\n" + format_qg_feedback(qg_issues))
                    if not patch_mode_hint:
                        nudge.append("Tip: If changes are small, you may reply with a patch next time.")
                    followups.append({"role": "user", "content": "\n".join(nudge)})
            else:
                followups.append({"role": "user", "content": "Controller: No HTML detected. Output a complete HTML5 document and then add [[DO:LINT]] and [[DO:QG_CHECK]]."})

        # Append agent response and controller feedback to conversation
        messages.append({"role": "assistant", "content": response_text})
        messages.extend(followups)

    print("Controller: Reached max rounds without finalization. Returning latest HTML if available.")
    return latest_html or ""

# ---------------- Main ----------------
def main():
    reset_cumulative_tokens()

    print("Describe your mini-game idea:")
    try:
        user_topic = input().strip()
    except EOFError:
        user_topic = ""
    if not user_topic:
        print("No input provided. Exiting.")
        return

    final_html = controller_loop(user_topic, max_rounds=12)

    print("\n" + "="*60)
    print(" CUMULATIVE TOKEN USAGE SUMMARY")
    print("="*60)
    print(f" Total Prompt Tokens:     {cumulative_tokens['prompt_tokens']:,}")
    print(f" Total Completion Tokens: {cumulative_tokens['completion_tokens']:,}")
    print(f" Total Tokens Used:       {cumulative_tokens['total_tokens']:,}")
    print("="*60)

    if final_html:
        print("\n----- BEGIN FINAL HTML OUTPUT -----\n")
        print(final_html.strip())
        print("\n----- END FINAL HTML OUTPUT -----")
    else:
        print("\nNo final HTML produced.")

if __name__ == "__main__":
    main()
    