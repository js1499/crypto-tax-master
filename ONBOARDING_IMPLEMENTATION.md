# User Onboarding Implementation

## Overview

This implementation adds a step-by-step onboarding flow to guide new users through the application setup. Users see contextual popups that guide them through connecting wallets, importing transactions, reviewing data, and generating tax reports.

## What Was Implemented

### 1. Onboarding State Management

**File**: `src/lib/onboarding.ts`

**Features**:
- LocalStorage-based state persistence
- Step tracking and completion
- Automatic step progression
- Skip functionality

**Steps Defined**:
1. **Connect Your Wallet or Exchange** - Guide users to connect accounts
2. **Import Transactions** - Show how to import transaction data
3. **Review & Categorize Transactions** - Guide transaction review
4. **Generate Tax Report** - Show how to create tax reports

### 2. Onboarding Provider

**File**: `src/components/onboarding/onboarding-provider.tsx`

**Features**:
- React Context for global onboarding state
- Automatic step completion detection
- Page navigation for each step
- Element targeting with data attributes
- Progress tracking

### 3. Onboarding Tooltip Component

**File**: `src/components/onboarding/onboarding-tooltip.tsx`

**Features**:
- Beautiful popup tooltip with backdrop
- Positioned relative to target elements
- Step indicators (progress dots)
- Previous/Next navigation
- Skip and Complete buttons
- Responsive positioning (adjusts if off-screen)

### 4. UI Integration

**Dashboard** (`src/app/page.tsx`):
- Welcome card for new users
- "Start Guide" button
- Overview of all 4 steps

**Accounts Page** (`src/app/accounts/page.tsx`):
- `data-onboarding="connect-wallet"` on "Add Account" buttons
- Automatic step completion when wallet/exchange connected

**Transactions Page** (`src/app/transactions/page.tsx`):
- `data-onboarding="import-transactions"` on Import button
- `data-onboarding="review-transactions"` on transactions table
- Automatic step completion when transactions imported

**Tax Reports Page** (`src/app/tax-reports/page.tsx`):
- `data-onboarding="generate-report"` on Form 8949 download button
- Automatic step completion when report generated

## How It Works

### Initial Flow

1. **User lands on empty dashboard**:
   ```
   Dashboard → Shows welcome card
   → User clicks "Start Guided Tour"
   → Onboarding activates
   ```

2. **Step 1: Connect Wallet**:
   ```
   Tooltip appears pointing to "Add Account" button
   → User clicks button
   → Connects wallet/exchange
   → Step automatically completes
   → Moves to Step 2
   ```

3. **Step 2: Import Transactions**:
   ```
   Navigates to Transactions page
   → Tooltip appears pointing to "Import" button
   → User imports transactions
   → Step automatically completes
   → Moves to Step 3
   ```

4. **Step 3: Review Transactions**:
   ```
   Tooltip appears pointing to transactions table
   → User reviews transactions
   → User clicks "Next"
   → Moves to Step 4
   ```

5. **Step 4: Generate Tax Report**:
   ```
   Navigates to Tax Reports page
   → Tooltip appears pointing to "Download Form 8949" button
   → User downloads report
   → Step completes
   → Onboarding finished!
   ```

### Automatic Step Detection

The onboarding system automatically detects when steps are completed:

- **Step 1**: Checks if user has wallets or exchanges connected
- **Step 2**: Checks if user has transactions imported
- **Step 3**: Manual progression (user clicks Next)
- **Step 4**: Manual completion (user downloads report)

### State Persistence

- Onboarding state stored in `localStorage`
- Persists across page refreshes
- Can be reset for testing

## User Experience

### Welcome Card

When user first visits dashboard:
- Large, prominent welcome card
- Shows all 4 steps with descriptions
- "Start Guided Tour" button
- "Skip for Now" option

### Tooltip Features

- **Backdrop**: Dark overlay highlights the tooltip
- **Positioning**: Automatically positions near target element
- **Responsive**: Adjusts if tooltip would go off-screen
- **Navigation**: Previous/Next buttons
- **Progress**: Visual progress dots
- **Skip**: X button to skip entire onboarding

### Step Progression

- **Automatic**: Steps 1 and 2 auto-complete when actions are taken
- **Manual**: Steps 3 and 4 require user to click "Next" or "Complete"
- **Smart Navigation**: Automatically navigates to correct page for each step

## Technical Details

### Data Attributes

Elements are marked with `data-onboarding` attributes:
```tsx
<Button data-onboarding="connect-wallet">Add Account</Button>
<Button data-onboarding="import-transactions">Import</Button>
<div data-onboarding="review-transactions">...</div>
<Button data-onboarding="generate-report">Download</Button>
```

### State Management

```typescript
interface OnboardingState {
  isActive: boolean;
  currentStep: number;
  steps: OnboardingStep[];
  completed: boolean;
}
```

### Step Definition

```typescript
interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  targetPage?: string;
  targetElement?: string;
  completed: boolean;
}
```

## Customization

### Adding New Steps

Edit `src/lib/onboarding.ts`:
```typescript
export const ONBOARDING_STEPS = [
  // ... existing steps
  {
    id: "new-step",
    title: "New Step Title",
    description: "Step description",
    targetPage: "/target-page",
    targetElement: "[data-onboarding='new-step']",
  },
];
```

### Changing Step Order

Reorder the array in `ONBOARDING_STEPS`.

### Customizing Messages

Edit step titles and descriptions in `ONBOARDING_STEPS`.

## Testing

### Reset Onboarding

```typescript
import { resetOnboarding } from "@/lib/onboarding";
resetOnboarding(); // Clears localStorage
```

### Manual Step Completion

```typescript
import { completeStep } from "@/lib/onboarding";
completeStep("connect-wallet");
```

### Check Onboarding State

```typescript
import { getOnboardingState } from "@/lib/onboarding";
const state = getOnboardingState();
console.log(state);
```

## User Flow Examples

### First-Time User

1. Visits dashboard → Sees welcome card
2. Clicks "Start Guided Tour"
3. Guided through all 4 steps
4. Completes onboarding
5. Never sees onboarding again

### Returning User

1. Visits dashboard → No welcome card (already completed)
2. Can manually restart via settings (if implemented)

### Partial Completion

1. User starts onboarding
2. Connects wallet (Step 1 auto-completes)
3. User closes browser
4. Returns later → Onboarding resumes at Step 2

## Benefits

- **Reduces Confusion**: Users know exactly what to do
- **Increases Engagement**: Guided experience keeps users engaged
- **Reduces Support**: Fewer "how do I..." questions
- **Better Onboarding**: Professional first impression
- **Flexible**: Can skip or restart anytime

## Future Enhancements

1. **Database Storage**: Store onboarding state in database (not just localStorage)
2. **Analytics**: Track which steps users complete/skip
3. **A/B Testing**: Test different onboarding flows
4. **Video Tutorials**: Embed video guides in tooltips
5. **Interactive Highlights**: Highlight specific UI elements
6. **Progress Persistence**: Sync across devices
7. **Customizable Steps**: Allow admins to customize steps

## Notes

- Onboarding state is stored in localStorage (client-side only)
- Steps auto-complete based on API checks (wallets, transactions)
- Tooltip positioning is responsive and handles edge cases
- Backdrop prevents interaction with other UI elements during onboarding
- Users can skip onboarding at any time
