import mealie from './lib/mealie.js';

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

/** Upcoming week: today through the next 6 days (7 days total). */
function upcomingWeekRange() {
    const start = todayISO();
    const end = addDaysISO(start, 6);
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
    const { start, end } = upcomingWeekRange();
    const pagination = await mealie.getMealPlans(start, end);
    const items = pagination.items || [];

    const byDayAndType = new Map();

    for (const entry of items) {
        const date = entry.date?.slice(0, 10);
        if (!date) {
            continue;
        }
        const type = entry.entryType;
        if (!byDayAndType.has(date)) {
            byDayAndType.set(date, new Map());
        }
        const byType = byDayAndType.get(date);
        if (!byType.has(type)) {
            byType.set(type, entry);
        }
    }

    const days = enumerateDays(start, end);
    const created = [];

    for (const entryType of CATEGORY_ORDER) {
        for (const date of days) {
            let byType = byDayAndType.get(date);
            if (!byType) {
                byType = new Map();
                byDayAndType.set(date, byType);
            }
            const existing = byType.get(entryType);
            if (existing && isSlotFilled(existing)) {
                continue;
            }
            const plan = await mealie.createRandomPlanEntry({ date, entryType });
            created.push({ date, entryType, id: plan.id, recipe: plan.recipe?.name || plan.recipe?.slug });
            byType.set(entryType, plan);
        }
    }

    const payload = { range: { start, end }, filledCount: created.length, filledSlots: created };
    console.log(JSON.stringify(payload, null, 2));
    if (created.length === 0) {
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
