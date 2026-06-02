import test from 'node:test';
import assert from 'node:assert/strict';

import { fillRange } from '../src/planner.js';

function makeFakeMealie({
    existing = [],
    createResult = (body) => ({ id: `${body.date}-${body.entryType}`, recipe: { slug: 'x' } }),
    getRecipeBySlug = async (slug) => ({ id: `id-for-${slug}`, slug }),
} = {}) {
    const calls = [];
    return {
        calls,
        mealie: {
            async getMealPlans() {
                return { items: existing };
            },
            async createRandomPlanEntry(body) {
                calls.push({ kind: 'random', ...body });
                return createResult(body);
            },
            async getRecipeBySlug(slug) {
                calls.push({ kind: 'getRecipeBySlug', slug });
                return getRecipeBySlug(slug);
            },
            async createPlanEntry(body) {
                calls.push({ kind: 'createPlanEntry', ...body });
                return createResult(body);
            },
        },
    };
}

test('creates in global order: all dinners, then lunches, then breakfasts (chronological by day)', async () => {
    const { mealie, calls } = makeFakeMealie();
    const start = '2026-04-07';
    const end = '2026-04-09';

    await fillRange({ mealie, start, end, categories: ['dinner', 'lunch', 'breakfast'] });

    assert.deepEqual(calls, [
        { kind: 'random', date: '2026-04-07', entryType: 'dinner' },
        { kind: 'random', date: '2026-04-08', entryType: 'dinner' },
        { kind: 'random', date: '2026-04-09', entryType: 'dinner' },
        { kind: 'random', date: '2026-04-07', entryType: 'lunch' },
        { kind: 'random', date: '2026-04-08', entryType: 'lunch' },
        { kind: 'random', date: '2026-04-09', entryType: 'lunch' },
        { kind: 'random', date: '2026-04-07', entryType: 'breakfast' },
        { kind: 'random', date: '2026-04-08', entryType: 'breakfast' },
        { kind: 'random', date: '2026-04-09', entryType: 'breakfast' },
    ]);
});

test('does not create when a slot already has a recipe', async () => {
    const existing = [
        { date: '2026-04-07', entryType: 'dinner', recipeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
        { date: '2026-04-08', entryType: 'lunch', recipe: { slug: 'already-filled' } },
    ];
    const { mealie, calls } = makeFakeMealie({ existing });

    const start = '2026-04-07';
    const end = '2026-04-08';
    await fillRange({ mealie, start, end, categories: ['dinner', 'lunch'] });

    assert.deepEqual(calls, [
        // dinner: 04-07 is filled, 04-08 is missing
        { kind: 'random', date: '2026-04-08', entryType: 'dinner' },
        // lunch: 04-07 is missing, 04-08 is filled
        { kind: 'random', date: '2026-04-07', entryType: 'lunch' },
    ]);
});

test('uses fixed slug for missing slots (slug resolved once, then createPlanEntry)', async () => {
    const { mealie, calls } = makeFakeMealie();
    const start = '2026-04-07';
    const end = '2026-04-08';

    await fillRange({
        mealie,
        start,
        end,
        categories: ['breakfast'],
        fixedSlugsByType: { breakfast: 'yoghurt-met-banaan-aardbeien-en-kokos' },
    });

    assert.deepEqual(calls, [
        { kind: 'getRecipeBySlug', slug: 'yoghurt-met-banaan-aardbeien-en-kokos' },
        { kind: 'createPlanEntry', date: '2026-04-07', entryType: 'breakfast', recipeId: 'id-for-yoghurt-met-banaan-aardbeien-en-kokos' },
        { kind: 'createPlanEntry', date: '2026-04-08', entryType: 'breakfast', recipeId: 'id-for-yoghurt-met-banaan-aardbeien-en-kokos' },
    ]);
});

test('mixes fixed and random while preserving global order', async () => {
    const { mealie, calls } = makeFakeMealie();
    const start = '2026-04-07';
    const end = '2026-04-08';

    await fillRange({
        mealie,
        start,
        end,
        categories: ['dinner', 'lunch', 'breakfast'],
        fixedSlugsByType: { breakfast: 'fixed-bfast' },
    });

    assert.deepEqual(calls, [
        // dinners (random) first
        { kind: 'random', date: '2026-04-07', entryType: 'dinner' },
        { kind: 'random', date: '2026-04-08', entryType: 'dinner' },
        // lunches (random) second
        { kind: 'random', date: '2026-04-07', entryType: 'lunch' },
        { kind: 'random', date: '2026-04-08', entryType: 'lunch' },
        // breakfasts (fixed) last
        { kind: 'getRecipeBySlug', slug: 'fixed-bfast' },
        { kind: 'createPlanEntry', date: '2026-04-07', entryType: 'breakfast', recipeId: 'id-for-fixed-bfast' },
        { kind: 'createPlanEntry', date: '2026-04-08', entryType: 'breakfast', recipeId: 'id-for-fixed-bfast' },
    ]);
});

