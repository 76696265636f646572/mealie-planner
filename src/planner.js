function addDaysISO(isoDate, days) {
    const d = new Date(`${isoDate}T12:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

/**
 * Fill meal plan gaps for a date range.
 *
 * Creation order is GLOBAL (important):
 * - all missing dinners for the range (chronological)
 * - then all missing lunches (chronological)
 * - then all missing breakfasts (chronological)
 *
 * @param {{
 *   mealie: {
 *     getMealPlans: (start: string, end: string) => Promise<{items?: any[]}>,
 *     createRandomPlanEntry: (body: {date: string, entryType: string}) => Promise<any>,
 *     getRecipeBySlug?: (slug: string) => Promise<any>,
 *     createPlanEntry?: (body: {date: string, entryType: string, recipeId: string}) => Promise<any>,
 *   },
 *   start: string,
 *   end: string,
 *   categories?: string[],
 *   fixedSlugsByType?: Record<string, string>
 * }} args
 */
export async function fillRange({
    mealie,
    start,
    end,
    categories = ['dinner', 'lunch', 'breakfast'],
    fixedSlugsByType = {},
}) {
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
    const recipeIdBySlug = new Map();

    for (const entryType of categories) {
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

            const fixedSlug = fixedSlugsByType?.[entryType];
            let plan;
            if (fixedSlug) {
                if (typeof mealie.getRecipeBySlug !== 'function' || typeof mealie.createPlanEntry !== 'function') {
                    throw new Error('Fixed slug configured but mealie client lacks getRecipeBySlug/createPlanEntry');
                }

                let recipeId = recipeIdBySlug.get(fixedSlug);
                if (!recipeId) {
                    const recipe = await mealie.getRecipeBySlug(fixedSlug);
                    recipeId = recipe?.id;
                    if (!recipeId) {
                        throw new Error(`Could not resolve recipe id for slug: ${fixedSlug}`);
                    }
                    recipeIdBySlug.set(fixedSlug, recipeId);
                }

                plan = await mealie.createPlanEntry({ date, entryType, recipeId });
            } else {
                plan = await mealie.createRandomPlanEntry({ date, entryType });
            }

            created.push({
                date,
                entryType,
                id: plan.id,
                recipe: plan.recipe?.name || plan.recipe?.slug,
            });
            byType.set(entryType, plan);
        }
    }

    return { range: { start, end }, filledCount: created.length, filledSlots: created };
}

