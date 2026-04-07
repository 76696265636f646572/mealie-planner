import mealie from './lib/mealie.js';
import { fillRange } from './planner.js';

/**
 * Meal plan categories. API calls run in this order:
 * every missing dinner for the range (day by day), then every missing lunch, then every missing breakfast.
 * That global order matters for Mealie’s random meal rules and how the planner “sees” prior picks.
 */
const CATEGORY_ORDER = ['dinner', 'lunch', 'breakfast'];

function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDaysISO(isoDate, days) {
    const d = new Date(`${isoDate}T12:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function isISODate(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Configurable range (defaults to upcoming 7 days).
 *
 * Env vars:
 * - PLANNER_START_DATE=YYYY-MM-DD (default: today)
 * - PLANNER_DAYS=N (default: 7)
 * - PLANNER_END_DATE=YYYY-MM-DD (optional; overrides PLANNER_DAYS)
 */
function configuredRange() {
    const start = process.env.PLANNER_START_DATE || todayISO();
    if (!isISODate(start)) {
        throw new Error(`Invalid PLANNER_START_DATE (expected YYYY-MM-DD): ${start}`);
    }

    const explicitEnd = process.env.PLANNER_END_DATE;
    if (explicitEnd != null && explicitEnd !== '') {
        if (!isISODate(explicitEnd)) {
            throw new Error(`Invalid PLANNER_END_DATE (expected YYYY-MM-DD): ${explicitEnd}`);
        }
        if (explicitEnd < start) {
            throw new Error(`PLANNER_END_DATE must be >= PLANNER_START_DATE (${explicitEnd} < ${start})`);
        }
        return { start, end: explicitEnd };
    }

    const rawDays = process.env.PLANNER_DAYS || '7';
    const days = Number.parseInt(rawDays, 10);
    if (!Number.isFinite(days) || days < 1) {
        throw new Error(`Invalid PLANNER_DAYS (expected integer >= 1): ${rawDays}`);
    }
    const end = addDaysISO(start, days - 1);
    return { start, end };
}

function enumerateDays(start, end) {
    const days = [];
    let cur = start;
    while (cur <= end) {
        days.push(cur);
        cur = addDaysISO(cur, 1);
    }
    return days;
}

function isSlotFilled(entry) {
    return Boolean(entry?.recipeId || (entry?.recipe && entry.recipe.slug));
}

async function main() {
    const { start, end } = configuredRange();
    const payload = await fillRange({ mealie, start, end, categories: CATEGORY_ORDER });
    console.log(JSON.stringify(payload, null, 2));
    if (payload.filledCount === 0) {
        console.error(
            'mealie-planner: success — no gaps to fill (breakfast/lunch/dinner already set for each day in range).',
        );
    }
}

const OUTER_ATTEMPTS = 8;

for (let attempt = 1; attempt <= OUTER_ATTEMPTS; attempt++) {
    try {
        await main();
        break;
    } catch (err) {
        const isLast = attempt === OUTER_ATTEMPTS;
        const detail = err?.response?.data ?? err?.message ?? err;
        console.error(`mealie-planner: attempt ${attempt}/${OUTER_ATTEMPTS} failed:`, detail);
        if (isLast) {
            process.exitCode = 1;
            break;
        }
        const wait = Math.min(2000 * 2 ** (attempt - 1), 30000) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, wait));
    }
}
