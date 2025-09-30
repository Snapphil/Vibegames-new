# Problem Finder Agent - Visual Flow Diagram

## System Flow with Problem Finder Integration

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INPUT                                  │
│  "Create a space shooter game with touch controls"                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    PRE-ROUND PLANNING                               │
│  • Expand idea into detailed Game Plan                             │
│  • Specify: Idea, Render, Controls, Color Theme, Camera            │
│  • Uses: gpt-5-mini (or configured model)                          │
│  • Tokens: ~500-1000                                               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌═════════════════════════════════════════════════════════════════════┐
║                         ROUND 1                                     ║
║  ┌─────────────────────────────────────────────────────────────┐   ║
║  │ GENERATION                                                  │   ║
║  │ • Input: Game Plan + Instructions                           │   ║
║  │ • Output: Initial HTML code                                 │   ║
║  │ • Runs: Linter + QA Checks                                  │   ║
║  │ • Tokens: ~3000-5000                                        │   ║
║  └─────────────────────────────────────────────────────────────┘   ║
╚═════════════════════════════════════════════════════════════════════╝
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   🔍 PROBLEM FINDER ANALYSIS                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ INPUT:                                                      │   │
│  │ • HTML from Round 1                                         │   │
│  │ • Game Plan                                                 │   │
│  │ • Linter errors: [3 errors found]                          │   │
│  │ • QA issues: [missing touch controls, no viewport]          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            ↓                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ANALYSIS (API Call)                                         │   │
│  │ • Model: gpt-5-mini                                         │   │
│  │ • Response Format: JSON                                     │   │
│  │ • Tokens: ~800-1200                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            ↓                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ OUTPUT (JSON):                                              │   │
│  │ {                                                           │   │
│  │   "should_terminate": false,                                │   │
│  │   "reasoning": "Found 3 critical issues...",                │   │
│  │   "problems": [                                             │   │
│  │     {                                                       │   │
│  │       "id": 1,                                              │   │
│  │       "priority": "high",                                   │   │
│  │       "description": "Unclosed div tag at line 45"         │   │
│  │     },                                                      │   │
│  │     {                                                       │   │
│  │       "id": 2,                                              │   │
│  │       "priority": "high",                                   │   │
│  │       "description": "Missing touch event handlers"         │   │
│  │     },                                                      │   │
│  │     {                                                       │   │
│  │       "id": 3,                                              │   │
│  │       "priority": "medium",                                 │   │
│  │       "description": "Add viewport meta tag"               │   │
│  │     }                                                       │   │
│  │   ]                                                         │   │
│  │ }                                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  📊 DISPLAYED IN OVERLAY:                                          │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │ 🔍 Problem Finder Analysis           1,234 tokens         │    │
│  │ Found 3 issue(s) to address                               │    │
│  │ Reasoning: "Found 3 critical issues..."                   │    │
│  │                                                            │    │
│  │ 🔴 HIGH  #1 Unclosed div tag at line 45                   │    │
│  │ 🔴 HIGH  #2 Missing touch event handlers                  │    │
│  │ 🟠 MED   #3 Add viewport meta tag                         │    │
│  └───────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
        ┌──────────────────────────────────┐
        │   should_terminate = false?      │
        └──────────────────────────────────┘
                  ↓ YES          ↓ NO
          Continue to    ┌────────────────┐
          Round 2        │  FINALIZE      │
                         │  Return HTML   │
                         └────────────────┘
                              
┌═════════════════════════════════════════════════════════════════════┐
║                         ROUND 2                                     ║
║  ┌─────────────────────────────────────────────────────────────┐   ║
║  │ GENERATION WITH FIXES                                       │   ║
║  │ • Input: Previous HTML + Problem Finder feedback            │   ║
║  │ • Focus: Fix high priority issues first                     │   ║
║  │ • Output: Updated HTML code                                 │   ║
║  │ • Runs: Linter + QA Checks                                  │   ║
║  │ • Tokens: ~2500-4000                                        │   ║
║  └─────────────────────────────────────────────────────────────┘   ║
╚═════════════════════════════════════════════════════════════════════╝
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   🔍 PROBLEM FINDER ANALYSIS                        │
│  INPUT: Updated HTML + Game Plan + Errors (0 found!)               │
│                                                                     │
│  OUTPUT:                                                            │
│  {                                                                  │
│    "should_terminate": true,                                        │
│    "reasoning": "All issues resolved. Code is ready!",              │
│    "problems": []                                                   │
│  }                                                                  │
│                                                                     │
│  📊 DISPLAYED IN OVERLAY:                                          │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │ 🔍 Problem Finder Analysis           856 tokens           │    │
│  │ No issues found - Ready to finalize!                      │    │
│  │ Reasoning: "All issues resolved. Code is ready!"          │    │
│  └───────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
        ┌──────────────────────────────────┐
        │   should_terminate = true?       │
        └──────────────────────────────────┘
                       ↓ YES
              ┌────────────────────┐
              │   ✨ FINALIZE      │
              │   Return HTML      │
              │   Enable Edit Mode │
              └────────────────────┘
```

## Token Usage Breakdown

### Typical Generation (Early Termination at Round 2)

```
┌─────────────────────────────────────┬─────────────────┐
│ Component                           │ Tokens          │
├─────────────────────────────────────┼─────────────────┤
│ Pre-Round Planning                  │ ~800            │
│ Round 1 Generation                  │ ~4,000          │
│ Problem Finder #1 (before Round 2)  │ ~1,200          │
│ Round 2 Generation                  │ ~3,000          │
│ Problem Finder #2 (terminates)      │ ~800            │
├─────────────────────────────────────┼─────────────────┤
│ TOTAL                               │ ~9,800 tokens   │
└─────────────────────────────────────┴─────────────────┘

✅ SAVED: ~15,000 tokens vs old 12-round system
```

### Maximum Generation (Full 5 Rounds)

```
┌─────────────────────────────────────┬─────────────────┐
│ Component                           │ Tokens          │
├─────────────────────────────────────┼─────────────────┤
│ Pre-Round Planning                  │ ~800            │
│ Round 1 Generation                  │ ~4,000          │
│ Problem Finder #1                   │ ~1,200          │
│ Round 2 Generation                  │ ~3,500          │
│ Problem Finder #2                   │ ~1,100          │
│ Round 3 Generation                  │ ~3,200          │
│ Problem Finder #3                   │ ~1,000          │
│ Round 4 Generation                  │ ~3,000          │
│ Problem Finder #4                   │ ~900            │
│ Round 5 Generation                  │ ~2,800          │
├─────────────────────────────────────┼─────────────────┤
│ TOTAL                               │ ~21,500 tokens  │
└─────────────────────────────────────┴─────────────────┘

✅ SAVED: ~30,000 tokens vs old 12-round system
```

## UI Components in Overlay

```
┌──────────────────────────────────────────────────────────────┐
│ Generation History                                      [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [User Input Bubble - Right Aligned]                    │ │
│  │ "Create a space shooter with touch controls"           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Game Plan                                              │ │
│  │ Idea: Fast-paced vertical scrolling shooter...         │ │
│  │ Render: HTML5 Canvas API                               │ │
│  │ Controls: Touch joystick + fire button                 │ │
│  │ [More ▼]                                               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ● Round 1                                      4,234       │
│    Round 1: Generating response...                          │
│    Planning structure                                       │
│    • Created canvas game loop                               │
│    • Added player ship                                      │
│    • Implemented basic controls                             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 🔍 Problem Finder Analysis           1,234 tokens      │ │
│  │ Found 3 issue(s) to address                            │ │
│  │ Reasoning: "Code has syntax errors and missing..."      │ │
│  │                                                         │ │
│  │ ┌──────────────────────────────────────────────────┐  │ │
│  │ │ 🔴 HIGH  #1                                      │  │ │
│  │ │ Unclosed div tag at line 45                      │  │ │
│  │ │ Current: <div class="game-container">            │  │ │
│  │ │ Suggested: </div> <!-- close container -->       │  │ │
│  │ └──────────────────────────────────────────────────┘  │ │
│  │ ┌──────────────────────────────────────────────────┐  │ │
│  │ │ 🔴 HIGH  #2                                      │  │ │
│  │ │ Missing touch event handlers for mobile          │  │ │
│  │ └──────────────────────────────────────────────────┘  │ │
│  │ ┌──────────────────────────────────────────────────┐  │ │
│  │ │ 🟠 MEDIUM  #3                                    │  │ │
│  │ │ Add viewport meta tag for mobile scaling         │  │ │
│  │ └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ● Round 2                                      3,456       │
│    Round 2: Generating response...                          │
│    Fixing bugs                                              │
│    • Fixed unclosed tags                                    │
│    • Added touch controls                                   │
│    • Improved mobile support                                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 🔍 Problem Finder Analysis           856 tokens        │ │
│  │ No issues found - Ready to finalize!                   │ │
│  │ Reasoning: "All critical issues resolved..."           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ✨ Generation Complete!                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Problem Finder Container
- **Background:** `rgba(245, 158, 11, 0.1)` - Amber tint
- **Border:** `rgba(245, 158, 11, 0.3)` - Amber border
- **Icon Background:** `rgba(245, 158, 11, 0.2)` - Amber highlight

### Priority Badges
- **HIGH:** `#DC2626` (Red) - Critical bugs, syntax errors
- **MEDIUM:** `#F59E0B` (Orange) - Important improvements
- **LOW:** `#10B981` (Green) - Nice-to-have polish

### Text Colors
- **Title:** `#F59E0B` (Amber) - "Problem Finder Analysis"
- **Message:** `#FCD34D` (Light amber) - Status message
- **Reasoning:** `#E5E7EB` (Light gray) - Analysis explanation
- **Code:** `#E5E7EB` with monospace font

## Decision Tree

```
Start Generation
    │
    ▼
Round 1 → Generate HTML
    │
    ▼
Problem Finder Analyze
    │
    ├─→ should_terminate = true? → DONE ✨
    │
    ├─→ problems.length > 0?
    │   ├─→ YES: Send problems to Round 2
    │   └─→ NO: Continue to Round 2 anyway
    │
    ▼
Round 2 → Generate with Fixes
    │
    ▼
Problem Finder Analyze
    │
    ├─→ should_terminate = true? → DONE ✨
    │
    ├─→ problems.length > 0?
    │   ├─→ YES: Send problems to Round 3
    │   └─→ NO: Continue to Round 3
    │
    ▼
Round 3 → Continue...
    │
    ▼
... (up to Round 5)
    │
    ▼
Round 5 Complete → DONE (max rounds reached)
```

## Key Features Summary

✅ **Intelligent Analysis** - Compares code against Game Plan  
✅ **Early Termination** - Stops when quality is sufficient  
✅ **Prioritized Fixes** - HIGH/MEDIUM/LOW problem ranking  
✅ **Visual Feedback** - Beautiful UI showing analysis  
✅ **Token Tracking** - Transparent cost per analysis  
✅ **Type Safety** - Full TypeScript support  
✅ **Error Handling** - Graceful fallbacks  
✅ **Reusable Architecture** - Clean separation of concerns  

---

**Result:** A production-ready Problem Finder Agent that transforms blind iteration into intelligent, guided code improvement! 🎯
