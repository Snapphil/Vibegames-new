# Edit Mode Workflow - Complete Step-by-Step Guide

## Overview
The edit mode allows users to make targeted changes to already-generated game code using a patch-based system powered by AI.

## Complete Workflow

### 1. **Activation**
- Automatically enabled after successful game generation
- `isEditMode` state set to `true`
- Input placeholder changes to "What do you want to edit?"

### 2. **User Input Processing** (`handleSend`)
```typescript
if (isEditMode && gameHtml) {
  setEditQuery(userTopic);
  setInput("");
  Keyboard.dismiss();
  showPlanInfo(); // Show overlay for progress
  await handleEditRequest(userTopic);
  return;
}
```

### 3. **Edit Request Handler** (`handleEditRequest` - lines 1600-1713)

#### Step 3.1: Add User Query to History
```typescript
setEditRoundHistory(prev => [...prev, {
  round: prev.length + 1,
  message: editQuery,
  description: "Edit request",
  timestamp: Date.now(),
  status: "User edit query received",
  isUserQuery: true // Renders as right-aligned chat bubble
}]);
```

#### Step 3.2: Retry Loop (up to 2 attempts)
```typescript
let attempt = 1;
const maxAttempts = 2;

while (attempt <= maxAttempts) {
  // Status update
  setEditRoundHistory(prev => [...prev, {
    round: prev.length + 1,
    message: attempt === 1 ? "Editing the HTML" : `Fixing errors (Attempt ${attempt})`,
    description: attempt === 1 ? "Processing edit" : "Fixing linter/syntax errors",
    timestamp: Date.now(),
    status: attempt === 1 ? "Applying changes to code" : "Correcting errors in code"
  }]);
  
  // ... edit processing ...
}
```

#### Step 3.3: Number the HTML
```typescript
const numberedHtml = addLineNumbers(currentHtml);
// Converts:
// <canvas id="game">
// TO:
// 1|<canvas id="game">
```

#### Step 3.4: Prepare Prompt
```typescript
let promptToSend = editQuery;

if (attempt > 1) {
  // Include linter errors for retry
  const lintErrors = lintHtml(currentHtml);
  if (lintErrors.length > 0) {
    const errorReport = formatErrorsForPrompt(lintErrors);
    promptToSend = `${editQuery}\n\nFIX THESE LINTER/SYNTAX ERRORS:\n${errorReport}`;
  }
}
```

### 4. **API Call** (`callEditAPI` - lines 971-1038)

#### System Prompt (NEW - IMPROVED):
```
You are a patch developer for HTML game code. Your task is to edit the provided HTML code according to the user's request.

CRITICAL RULES:
1. Respond with ONLY a series of delete (-) and add (+) lines
2. NO extra text, NO explanations, NO headers like "Begin Patch" or "End Patch"
3. NO file names or separators between patches

FORMAT:
- For deletions: -lnN (where N is the line number to delete, NO CODE)
- For additions: +lnN <complete_new_code_line> (where N is the line number to insert at)

EXAMPLE RESPONSE:
-ln45
-ln46
-ln47
+ln45     <canvas id="game"></canvas>
+ln46     <script>
-ln102
+ln102       const speed = 5;

PROCESS:
1. Read the numbered HTML code provided
2. Identify lines that need to be removed or changed
3. Output deletion lines first (-lnN)
4. Then output addition lines with complete code (+lnN code...)
5. You can have multiple separate patches in one response

Remember: ONLY output the patch lines, nothing else.
```

#### User Prompt Format:
```
USER REQUEST: {userQuery}

NUMBERED HTML CODE:
1|<!DOCTYPE html>
2|<html>
3|<head>
...

Remember: Respond with ONLY the patch lines (-lnN for deletions, +lnN code for additions). No other text.
```

#### Console Logging:
```typescript
console.log('\n=== EDIT API REQUEST ===');
console.log('User Query:', userQuery);
console.log('System Prompt:', systemPrompt.substring(0, 200) + '...');
console.log('HTML Lines:', numberedHtml.split('\n').length);

// After API response:
console.log('\n=== EDIT API RESPONSE ===');
console.log('Full Response:');
console.log(aiResponse);
console.log('=== END RESPONSE ===\n');
```

### 5. **Parse AI Response** (`parseEditPatch` - lines 858-923)

#### Example AI Response:
```
-ln45
-ln46
+ln45 <canvas id="gameCanvas" width="800" height="600"></canvas>
-ln102
+ln102     const speed = 10;
+ln103     const gravity = 0.5;
```

#### Parsing Logic:
```typescript
const patches: Array<{ type: 'remove' | 'add'; lineNumber?: number; content?: string }> = [];

for (const line of lines) {
  const trimmedLine = line.trim();
  
  if (trimmedLine.startsWith('-ln')) {
    // Parse: -ln45
    const lineNumMatch = trimmedLine.match(/^-ln(\d+)$/);
    if (lineNumMatch) {
      patches.push({
        type: 'remove',
        lineNumber: parseInt(lineNumMatch[1])
      });
    }
  } else if (trimmedLine.startsWith('+ln')) {
    // Parse: +ln45 <canvas id="game">
    const contentMatch = trimmedLine.match(/^\+ln(\d+)\s+(.*)$/);
    if (contentMatch) {
      patches.push({
        type: 'add',
        lineNumber: parseInt(contentMatch[1]),
        content: contentMatch[2]
      });
    }
  }
}
```

#### Console Output:
```
=== PARSING EDIT PATCH ===
Raw response length: 156
DELETE line 45
DELETE line 46
ADD line 45: <canvas id="gameCanvas" width="800" height="600">...
DELETE line 102
ADD line 102:     const speed = 10;
ADD line 103:     const gravity = 0.5;
Total patches parsed: 6 (3 deletions, 3 additions)
=== END PARSING ===
```

### 6. **Apply Patches** (`applyEditPatches` - lines 925-963)

#### Process:
1. **Sort patches**:
   - Removals: Descending order (bottom to top)
   - Additions: Ascending order (top to bottom)

2. **Apply removals first**:
   ```typescript
   for (const removal of removals) {
     if (removal.lineNumber > 0 && removal.lineNumber <= lines.length) {
       lines.splice(removal.lineNumber - 1, 1);
     }
   }
   ```

3. **Apply additions**:
   ```typescript
   for (const addition of additions) {
     const insertIndex = Math.max(0, Math.min(addition.lineNumber - 1, lines.length));
     lines.splice(insertIndex, 0, addition.content);
   }
   ```

#### Console Output:
```
=== APPLYING PATCHES ===
Original HTML has 250 lines
Applying 3 removals...
  Removed line 102: const speed = 5;
  Removed line 46: </canvas>
  Removed line 45: <canvas id="game">
Applying 3 additions...
  Inserted at line 45: <canvas id="gameCanvas" width="800" height="600">...
  Inserted at line 102:     const speed = 10;
  Inserted at line 103:     const gravity = 0.5;
Result HTML has 250 lines
=== END APPLYING PATCHES ===
```

### 7. **Validation & Retry Logic**

```typescript
// Check for linter errors
const lintErrors = lintHtml(editedHtml);

if (lintErrors.length === 0 || attempt === maxAttempts) {
  // Accept result
  setGameHtml(editedHtml);
  
  if (lintErrors.length === 0) {
    // Success
    setEditRoundHistory(prev => [...prev, {
      round: prev.length + 1,
      message: "Edit completed",
      description: "Changes applied successfully",
      timestamp: Date.now(),
      status: `Applied ${parseResult.patches.length} changes`
    }]);
  } else {
    // Final attempt with remaining errors
    setEditRoundHistory(prev => [...prev, {
      round: prev.length + 1,
      message: "Edit completed with warnings",
      description: "Changes applied but some errors remain",
      timestamp: Date.now(),
      status: `Applied ${parseResult.patches.length} changes, ${lintErrors.length} linter errors remain`
    }]);
  }
  break;
} else {
  // Retry with errors
  currentHtml = editedHtml;
  attempt++;
}
```

### 8. **UI Feedback**

#### Edit Query Display (Right-aligned chat bubble):
```tsx
{status.isUserQuery && (
  <View style={styles.userQueryRow}>
    <View style={[styles.userQueryBubble, styles.editQueryBubble]}>
      <Text style={styles.userQueryText}>{status.message}</Text>
    </View>
  </View>
)}
```

#### Edit Status Display:
```tsx
<View style={styles.statusRow}>
  <View style={styles.statusItem}>
    <Text style={styles.statusMessage}>{status.message}</Text>
    <Text style={styles.statusDescription}>{status.description}</Text>
    {status.status && (
      <Text style={styles.statusUpdate}>{status.status}</Text>
    )}
  </View>
</View>
```

## Key Improvements Made

### 1. **Cleaner Prompt Engineering**
- ✅ Removed confusing "index.html" references
- ✅ Removed unnecessary "Begin Patch" / "End Patch" headers
- ✅ Clear, simple format: `-lnN` and `+lnN code`
- ✅ Multiple examples in system prompt

### 2. **Better Logging**
- ✅ Complete request/response logging
- ✅ Step-by-step patch parsing logs
- ✅ Detailed patch application logs
- ✅ Easy debugging of AI responses

### 3. **Robust Parsing**
- ✅ Handles lines with/without spaces after line numbers
- ✅ Skips empty lines gracefully
- ✅ Warns about unparseable lines
- ✅ Supports multiple patches in one response

### 4. **Error Recovery**
- ✅ Automatic retry with linter errors included
- ✅ Up to 2 attempts per edit
- ✅ Clear status messages for each attempt
- ✅ Graceful handling of final attempt failures

## Example Complete Flow

```
User: "Make the player move faster"
  ↓
Edit Request Created
  ↓
HTML Numbered (1|<!DOCTYPE html>...)
  ↓
API Called with:
  - System: "You are a patch developer..."
  - User: "USER REQUEST: Make the player move faster\n\nNUMBERED HTML CODE:\n1|..."
  ↓
AI Responds:
  -ln102
  +ln102     const speed = 10;
  ↓
Parse Patches:
  - DELETE line 102
  - ADD line 102: const speed = 10;
  ↓
Apply Patches:
  - Remove line 102
  - Insert at line 102
  ↓
Lint Check: ✅ No errors
  ↓
Update Game HTML
  ↓
Show Success: "Edit completed - Applied 2 changes"
```

## Console Output Example

```
=== EDIT API REQUEST ===
User Query: Make the player move faster
System Prompt: You are a patch developer for HTML game code. Your task is to edit the provided HTML code according to...
HTML Lines: 250

=== EDIT API RESPONSE ===
Full Response:
-ln102
+ln102     const speed = 10;
=== END RESPONSE ===

=== PARSING EDIT PATCH ===
Raw response length: 35
DELETE line 102
ADD line 102:     const speed = 10;
Total patches parsed: 2 (1 deletions, 1 additions)
=== END PARSING ===

=== APPLYING PATCHES ===
Original HTML has 250 lines
Applying 1 removals...
  Removed line 102: const speed = 5;
Applying 1 additions...
  Inserted at line 102:     const speed = 10;
Result HTML has 250 lines
=== END APPLYING PATCHES ===
```
